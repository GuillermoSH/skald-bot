/**
 * Skald en el chat del juego: escucha los mensajes que empiezan por «!» (los ve
 * en el log) y contesta con `tellraw` (plantilla cerrada). Sin cuenta de
 * Minecraft ni jugador falso: no aparece en la lista de conectados.
 *
 * - Solo para quien está unido al reino y es Einherjar (salvo `!ayuda`).
 * - Límites: un comando cada pocos segundos por jugador; lo que crea cosas en
 *   Discord (quedadas, encuestas), unas pocas por hora.
 * - Nada de lo que escribe un jugador llega a la consola: solo como texto dentro
 *   de un componente de tellraw o de un mensaje de Discord (sin menciones).
 */
import type { Client, SendableChannels } from "discord.js";
import { publishPoll } from "./commands/encuesta.js";
import { createQuedada } from "./commands/quedada.js";
import type { CommandContext } from "./commands/types.js";
import type { TextPart } from "./core/rcon.js";
import { MAX_PENDING_PER_USER } from "./core/reminders.js";
import { parseWhen } from "./core/when.js";
import { formatCount } from "./util/format.js";
import { gameDate, gameReply } from "./util/game.js";
import { log } from "./util/log.js";
import { texts } from "./util/texts.js";

const g = texts.game;
const COOLDOWN_MS = 5_000;
const CREATES_PER_HOUR = 3;
const YEAR_MS = 366 * 86_400_000;
/** Espera tras entrar (para que el chat del jugador ya esté cargado). */
const WELCOME_DELAY_MS = 3_000;
/** No se vuelve a saludar a quien entró hace poco (reconexiones). */
const WELCOME_COOLDOWN_MS = 10 * 60_000;

/** "!recordar 2h | regar" → { name: "recordar", args: "2h | regar" }. */
export function parseGameCommand(message: string): { name: string; args: string } | null {
  const m = /^!([a-záéíóúñ]+)(?:\s+(.*))?$/i.exec(message.trim());
  if (!m) return null;
  return { name: (m[1] ?? "").toLowerCase(), args: (m[2] ?? "").trim() };
}

/** "cuándo | texto"; sin barra, prueba a leer la fecha con las primeras palabras. */
export function splitWhen(args: string, now: Date, timeZone: string): { at: Date; rest: string } | null {
  const bar = args.indexOf("|");
  if (bar !== -1) {
    const at = parseWhen(args.slice(0, bar), now, timeZone);
    const rest = args.slice(bar + 1).trim();
    return at && rest ? { at, rest } : null;
  }
  const words = args.split(/\s+/);
  for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
    const at = parseWhen(words.slice(0, n).join(" "), now, timeZone);
    if (at) return { at, rest: words.slice(n).join(" ") };
  }
  return null;
}

export class GameChat {
  private readonly lastCommand = new Map<string, number>();
  private readonly creations = new Map<string, number[]>();
  private readonly welcomed = new Map<string, number>();
  private welcomeIndex = 0;

  constructor(
    private readonly ctx: CommandContext,
    private readonly client: Client<true>,
  ) {}

  /** Alguien ha entrado al servidor: saludo privado en el chat del juego. */
  async onJoin(player: string, delayMs = WELCOME_DELAY_MS): Promise<void> {
    const now = Date.now();
    if (now - (this.welcomed.get(player) ?? 0) < WELCOME_COOLDOWN_MS) return;
    this.welcomed.set(player, now);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));

    const phrase = g.welcome[this.welcomeIndex++ % g.welcome.length] ?? g.welcome[0];
    const others = await this.ctx.rcon
      .listPlayers()
      .then((l) => l.names.filter((n) => n !== player))
      .catch(() => null);
    const uuid = await this.ctx.names.uuidOf(player);
    const link = uuid ? this.ctx.realm.links?.byUuid(uuid) : null;
    const economy = this.ctx.realm.economy;

    // Un solo mensaje: cabeza y saludo; quién más está; monedas o cómo unirse.
    const [mark1, mark2] = g.lineMarks;
    const parts: TextPart[] = [
      { text: g.prefix, color: "gold", bold: true },
      { head: player },
      { text: ` ${g.welcomeMark}`, color: "gold" },
      { text: phrase(player), color: "yellow" },
    ];
    if (others) {
      parts.push({ br: true }, { text: `  ${mark1}`, color: "gold" });
      parts.push({ text: others.length > 0 ? g.company(others.slice(0, 10).join(", ")) : g.alone, color: "gray" });
    }
    parts.push({ br: true }, { text: `  ${mark2}`, color: "gold" });
    if (uuid && link?.status === "active") {
      if (economy) parts.push({ text: `${g.coins(formatCount(economy.balance(uuid)))} · `, color: "gray" });
      parts.push({ text: g.helpLink, color: "aqua", suggest: "!ayuda", hover: g.helpHover });
    } else {
      parts.push({ text: g.notLinkedTip, color: "gray" });
    }
    await this.ctx.rcon.tellraw(player, parts).catch((error: unknown) => {
      log.warn(`No se pudo saludar en el juego a ${player}: ${error instanceof Error ? error.message : String(error)}`);
    });
    await this.ctx.rcon.playSound(player, "horn").catch(() => undefined);
  }

  async onChat(player: string, message: string): Promise<void> {
    const cmd = parseGameCommand(message);
    if (!cmd) return;
    const now = Date.now();
    if (now - (this.lastCommand.get(player) ?? 0) < COOLDOWN_MS) {
      await this.reply(player, g.slowDown);
      return;
    }
    this.lastCommand.set(player, now);
    log.info(`!${cmd.name} por ${player} (juego)`);

    if (cmd.name === "ayuda" || cmd.name === "help") {
      for (const line of g.help) await this.reply(player, line);
      return;
    }

    // El resto, solo para quien está unido al reino.
    const uuid = await this.ctx.names.uuidOf(player);
    const link = uuid ? this.ctx.realm.links?.byUuid(uuid) : null;
    if (!uuid || link?.status !== "active") {
      await this.reply(player, g.notLinked);
      return;
    }

    switch (cmd.name) {
      case "tesoro": {
        const economy = this.ctx.realm.economy;
        await this.reply(player, economy ? g.balance(formatCount(economy.balance(uuid))) : g.noEconomy);
        return;
      }
      case "recordar":
        return this.remind(player, link.discordId, cmd.args);
      case "quedada":
        return this.quedada(player, link.discordId, cmd.args);
      case "encuesta":
        return this.poll(player, link.discordId, cmd.args);
      default:
        await this.reply(player, g.unknown(cmd.name.slice(0, 20)));
    }
  }

  private async remind(player: string, discordId: string, args: string): Promise<void> {
    const reminders = this.ctx.realm.reminders;
    const parsed = splitWhen(args, new Date(), this.ctx.config.TIMEZONE);
    if (!reminders || !parsed) {
      await this.reply(player, g.reminderUsage);
      return;
    }
    if (!(await this.checkDate(player, parsed.at))) return;
    if (reminders.pendingFor(discordId).length >= MAX_PENDING_PER_USER) {
      await this.reply(player, g.tooManyReminders);
      return;
    }
    reminders.add({
      kind: "user",
      guildId: this.ctx.config.DISCORD_GUILD_ID,
      // Si tiene los privados cerrados, se le recuerda en el canal del juego.
      channelId: this.channelId() ?? "",
      userId: discordId,
      text: parsed.rest.slice(0, 500),
      dueAt: parsed.at,
      eventId: null,
    });
    await this.reply(player, g.reminderSaved(gameDate(parsed.at, this.ctx.config.TIMEZONE)));
  }

  private async quedada(player: string, discordId: string, args: string): Promise<void> {
    const parsed = args.includes("|") ? splitWhen(args, new Date(), this.ctx.config.TIMEZONE) : null;
    if (!parsed) {
      await this.reply(player, g.quedadaUsage);
      return;
    }
    if (!(await this.checkDate(player, parsed.at)) || !(await this.allowCreation(player))) return;
    const title = parsed.rest.slice(0, 90);
    try {
      const guild = await this.client.guilds.fetch(this.ctx.config.DISCORD_GUILD_ID);
      await createQuedada(guild, await this.channel(), this.ctx, { title, start: parsed.at, hours: 2, organizerId: discordId });
      await this.reply(player, g.quedadaDone(title));
    } catch (error) {
      log.warn(`!quedada de ${player}: ${error instanceof Error ? error.message : String(error)}`);
      await this.reply(player, g.discordDown);
    }
  }

  private async poll(player: string, discordId: string, args: string): Promise<void> {
    const [question, ...answers] = args.split("|").map((p) => p.trim()).filter((p) => p.length > 0);
    const channel = await this.channel();
    if (!question || answers.length < 2 || answers.length > 8 || !channel) {
      await this.reply(player, g.pollUsage);
      return;
    }
    if (!(await this.allowCreation(player))) return;
    try {
      await publishPoll(channel, {
        header: `${texts.encuesta.header(`<@${discordId}>`)}\n-# ${g.fromGame(player)}`,
        question,
        answers,
        hours: 24,
        multiple: false,
      });
      await this.reply(player, g.pollDone);
    } catch (error) {
      log.warn(`!encuesta de ${player}: ${error instanceof Error ? error.message : String(error)}`);
      await this.reply(player, g.discordDown);
    }
  }

  private async checkDate(player: string, at: Date): Promise<boolean> {
    const ahead = at.getTime() - Date.now();
    if (ahead < 60_000) {
      await this.reply(player, g.pastDate);
      return false;
    }
    if (ahead > YEAR_MS) {
      await this.reply(player, g.farDate);
      return false;
    }
    return true;
  }

  private async allowCreation(player: string): Promise<boolean> {
    const hourAgo = Date.now() - 3_600_000;
    const recent = (this.creations.get(player) ?? []).filter((t) => t > hourAgo);
    if (recent.length >= CREATES_PER_HOUR) {
      await this.reply(player, g.tooMany);
      return false;
    }
    recent.push(Date.now());
    this.creations.set(player, recent);
    return true;
  }

  private channelId(): string | null {
    return this.ctx.config.GAME_CHAT_CHANNEL_ID ?? this.ctx.config.COMMAND_CHANNEL_IDS[0] ?? null;
  }

  private async channel(): Promise<SendableChannels | null> {
    const id = this.channelId();
    if (!id) return null;
    const channel = await this.client.channels.fetch(id).catch(() => null);
    return channel?.isSendable() ? channel : null;
  }

  private async reply(player: string, text: string): Promise<void> {
    await this.ctx.rcon.tellraw(player, gameReply(text)).catch((error: unknown) => {
      log.warn(`No se pudo contestar en el juego a ${player}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}
