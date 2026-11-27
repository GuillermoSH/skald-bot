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
import { describeClock, readWeather, readWorldClock } from "./core/sky.js";
import { describeWeather } from "./commands/cielo.js";
import { announceTaskEvents, taskName, weeklyName } from "./commands/tareas.js";
import { describePrize, failureText } from "./commands/ruleta.js";
import { TASK_REWARD } from "./core/tasks.js";
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
const WELCOME_COOLDOWN_MS = 5 * 60_000;

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

/** Color base de la ayuda (lo heredan las descripciones). */
export const HELP_BASE = "gray" as const;

/** !ayuda en un solo mensaje: cada comando se pulsa (queda escrito) y enseña su uso al pasar el ratón. */
export function helpMessage(): TextPart[] {
  const [mark] = g.lineMarks;
  const parts: TextPart[] = [
    { text: g.prefix, color: "gold", bold: true },
    { text: `${mark}${g.helpTitle}`, color: "yellow" },
  ];
  for (const item of g.helpItems) {
    // La ⚔ va en el mismo trozo que el comando (ocupa menos: RCON tiene límite de tamaño).
    parts.push(
      { br: true },
      { text: `  ${g.welcomeMark}${item.cmd}`, color: "aqua", suggest: `${item.cmd} `, ...(item.usage !== item.cmd ? { hover: item.usage } : {}) },
      { text: ` — ${item.desc}`, color: "gray" },
    );
  }
  return parts;
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

    if (cmd.name === "cielo") {
      await this.ctx.rcon.tellraw(player, await this.skyMessage()).catch((error: unknown) => {
        log.warn(`No se pudo enseñar el cielo a ${player}: ${error instanceof Error ? error.message : String(error)}`);
      });
      return;
    }

    if (cmd.name === "ayuda" || cmd.name === "help") {
      await this.ctx.rcon.tellraw(player, helpMessage(), HELP_BASE).catch((error: unknown) => {
        log.warn(`No se pudo enseñar la ayuda a ${player}: ${error instanceof Error ? error.message : String(error)}`);
      });
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
      case "ruleta":
        return this.spinRoulette(player, uuid);
      case "tareas":
        await this.ctx.rcon.tellraw(player, await this.tasksMessage(uuid, cmd.args)).catch(() => undefined);
        return;
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

  /** !ruleta: gira la rueda; el resultado solo lo ve quien tira (y un sonido si es gordo). */
  private async spinRoulette(player: string, uuid: string): Promise<void> {
    const roulette = this.ctx.roulette;
    if (!roulette) {
      await this.reply(player, texts.ruleta.economyOff);
      return;
    }
    const result = await roulette.spin(uuid, player);
    if (!result.ok) {
      await this.reply(player, failureText(result.reason, result.balance));
      return;
    }
    await this.ctx.lang.ready();
    const group = texts.ruleta.groups[result.prize.group].replace(/[^\p{L}\p{N}\s¡!]/gu, "").trim();
    await this.ctx.rcon
      .tellraw(player, [
        { text: g.prefix, color: "gold", bold: true },
        { text: group ? `${group}: ` : "", color: "gold" },
        { text: describePrize(result.prize, this.ctx.lang), color: "yellow" },
        { br: true },
        { text: `  ${texts.ruleta.gameAfter(formatCount(result.balance), result.spinsLeft)}`, color: "gray" },
      ])
      .catch(() => undefined);
    if (["valuable", "books", "jackpot"].includes(result.prize.group)) await this.ctx.rcon.playSound(player, "levelup").catch(() => undefined);
  }

  /** !tareas [cambiar N]: tus misiones de hoy con el progreso, y la del reino. */
  private async tasksMessage(uuid: string, args: string): Promise<TextPart[]> {
    const parts: TextPart[] = [{ text: g.prefix, color: "gold", bold: true }];
    const daily = this.ctx.realm.tasks;
    const players = await this.ctx.world.players().catch(() => []);
    const record = players.find((p) => p.uuid === uuid);
    if (!daily || !record) return [...parts, { text: texts.tareas.unavailable, color: "gray" }];

    const m = /^cambiar\s+([1-3])$/i.exec(args.trim());
    if (m) {
      const r = daily.reroll(record, Number(m[1]));
      parts.push({ text: r.ok ? texts.tareas.gameRerolled(taskName(r.task)) : texts.tareas.rerollFail[r.reason], color: r.ok ? "green" : "red" }, { br: true });
    }
    parts.push({ text: texts.tareas.gameTitle, color: "yellow" });
    // Si alguna ya llegó al objetivo, se paga ahora (el aviso sale justo antes de la lista).
    const { progress, completed } = daily.check(record);
    await announceTaskEvents(this.ctx, completed);
    for (const p of progress) {
      const mark = p.done ? "✔ " : `${Math.floor(p.progress)}/${p.task.target} `;
      parts.push(
        { br: true },
        { text: `  ${p.slot}. ${mark}`, color: p.done ? "green" : "gold" },
        { text: `${taskName(p.task)} (+${TASK_REWARD[p.task.tier]})`, color: p.done ? "dark_gray" : "gray" },
      );
    }
    const streak = daily.streakOf(uuid);
    if (streak) parts.push({ br: true }, { text: `  🔥 ${streak.current}`, color: "gold" });
    const weekly = this.ctx.realm.weeklyMission?.status(players);
    if (weekly) {
      const line = weekly.completedAt
        ? texts.tareas.gameWeeklyDone
        : texts.tareas.gameWeekly(weeklyName(weekly.mission), formatCount(Math.floor(Math.min(weekly.total, weekly.mission.target))), formatCount(weekly.mission.target));
      parts.push({ br: true }, { text: `  ${line}`, color: "aqua" });
    }
    return parts;
  }

  /** !cielo: hora, día, luna y clima en un solo mensaje (para todos, como !ayuda). */
  private async skyMessage(): Promise<TextPart[]> {
    const { config, rcon } = this.ctx;
    const [ticks, weather] = await Promise.all([
      rcon.queryTime().catch(() => readWorldClock(config.DATA_DIR).catch(() => null)),
      readWeather(config.DATA_DIR).catch(() => null),
    ]);
    const parts: TextPart[] = [{ text: g.prefix, color: "gold", bold: true }];
    if (ticks === null) return [...parts, { text: g.skyUnknown, color: "gray" }];
    const c = describeClock(ticks);
    const time = `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`;
    const moon = texts.cielo.moonNames[c.moonPhase] ?? "?";
    parts.push(
      { text: c.period === "night" || c.period === "dusk" ? "☽ " : "☀ ", color: "gold" },
      { text: g.skyLine(g.skyPeriod[c.period], time, formatCount(c.day), moon), color: "yellow" },
    );
    if (weather) {
      // El mismo texto que /cielo, sin emojis de Discord (en el juego no salen).
      const plain = describeWeather(weather).replace(/[^\p{L}\p{N}\s·~,.()-]/gu, "").replace(/\s+/g, " ").trim();
      parts.push({ br: true }, { text: "  ", color: "gold" }, { text: g.skyWeather(plain), color: "gray" });
    }
    return parts;
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
