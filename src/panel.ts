/**
 * Panel del reino: un mensaje fijo de Skald en `PANEL_CHANNEL_ID` que se edita
 * solo cada minuto (solo si algo ha cambiado). Lo reconoce por el pie, así que
 * sobrevive a los reinicios sin publicar otro. Si lo borran, publica uno nuevo.
 */
import { time, TimestampStyles, type Client, type EmbedBuilder, type Message, type SendableChannels } from "discord.js";
import type { CommandContext } from "./commands/types.js";
import { describePerformance } from "./commands/reino.js";
import { assessBackups, listBackups, type BackupStatus } from "./core/backups.js";
import type { TickInfo } from "./core/parsers.js";
import { getServerStatus } from "./core/status.js";
import { asset } from "./util/assets.js";
import { fetchSendableChannel } from "./util/channels.js";
import { baseEmbed, COLORS } from "./util/embeds.js";
import { safeText } from "./util/escape.js";
import { log } from "./util/log.js";
import { texts } from "./util/texts.js";

const t = texts.panel;
const REFRESH_MS = 60_000;

export type PanelState = "ok" | "empty" | "lag" | "down";

export interface PanelSnapshot {
  online: boolean;
  playersOnline: number;
  playersMax: number;
  names: string[];
  version: string | null;
  tick: TickInfo | null;
  era: string | null;
  pendingLevel: string | null;
  backup: { at: Date | null; status: BackupStatus } | null;
}

export function panelState(s: PanelSnapshot): PanelState {
  if (!s.online) return "down";
  if (s.tick && (s.tick.state === "lagging" || describePerformance(s.tick).load > 1)) return "lag";
  return s.playersOnline === 0 ? "empty" : "ok";
}

const fmt = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 1 });

/** El contenido del panel (sin imagen ni fecha), para comparar y para pintar. */
export function buildPanel(s: PanelSnapshot): { state: PanelState; embed: EmbedBuilder } {
  const state = panelState(s);
  const headline = { ok: t.awake, empty: t.empty, lag: t.lagging, down: t.asleep }[state];
  const color = state === "down" ? COLORS.error : state === "lag" ? COLORS.main : COLORS.ok;
  const embed = baseEmbed(color).setTitle(t.title).setDescription(headline).setFooter({ text: t.footer });

  if (s.online) {
    const names = s.names.length > 0 ? s.names.map((n) => safeText(n, 16)).sort((a, b) => a.localeCompare(b, "es")).join(", ") : t.nobody;
    embed.addFields({ name: t.warriors(s.playersOnline, s.playersMax), value: names.slice(0, 1000) });
    if (s.tick) {
      const perf = describePerformance(s.tick);
      embed.addFields(
        { name: t.tps, value: `${fmt(perf.tps)} / ${fmt(s.tick.targetRate)}`, inline: true },
        // Al milisegundo: más precisión haría que el panel cambiara cada minuto sin motivo.
        { name: t.mspt, value: `${Math.round(s.tick.averageMs)} ms`, inline: true },
      );
    } else {
      embed.addFields({ name: t.tps, value: t.noTicks, inline: true });
    }
    if (s.version) embed.addFields({ name: t.version, value: safeText(s.version, 40), inline: true });
  }
  if (s.era) {
    embed.addFields({ name: t.era, value: `${safeText(s.era, 40)}${s.pendingLevel ? t.eraPending(safeText(s.pendingLevel, 40)) : ""}`, inline: true });
  }
  if (s.backup) {
    const when = s.backup.at ? time(s.backup.at, TimestampStyles.RelativeTime) : t.backupNone;
    embed.addFields({ name: t.backup, value: `${when}${t.backupWarn[s.backup.status]}`, inline: true });
  }
  return { state, embed };
}

async function snapshot(ctx: CommandContext): Promise<PanelSnapshot> {
  const { config, rcon, realm } = ctx;
  const status = await getServerStatus(config.MC_HOST, config.MC_PORT, config.RCON_TIMEOUT_MS);
  let tick: TickInfo | null = null;
  let names: string[] = [];
  if (status.online) {
    const sample = status.playerSample;
    [tick, names] = await Promise.all([
      rcon.queryTick().catch(() => null),
      rcon
        .listPlayers()
        .then((l) => l.names)
        .catch(() => sample),
    ]);
  }
  let backup: PanelSnapshot["backup"] = null;
  try {
    const health = assessBackups(await listBackups(config.BACKUPS_DIR), new Date(), config.BACKUP_MAX_AGE_HOURS * 3_600_000);
    backup = { at: health.latest?.mtime ?? null, status: health.status };
  } catch {
    // Sin carpeta de copias: el panel no lo enseña.
  }
  return {
    online: status.online,
    playersOnline: status.online ? status.playersOnline : 0,
    playersMax: status.online ? status.playersMax : 0,
    names,
    version: status.online ? status.version : null,
    tick,
    era: realm.season?.name ?? null,
    pendingLevel: realm.pendingLevelName,
    backup,
  };
}

export async function startPanel(client: Client<true>, ctx: CommandContext, channelId: string): Promise<() => void> {
  const channel = await fetchSendableChannel(client, channelId, "panel", ["ViewChannel", "SendMessages", "EmbedLinks", "AttachFiles", "ReadMessageHistory"]);
  if (!channel) return () => undefined;

  let message: Message | null = await findPanel(client, channel);
  let last: string | null = message ? fingerprint(message.embeds[0]?.toJSON()) : null;
  let busy = false;

  const refresh = async () => {
    if (busy) return;
    busy = true;
    try {
      const { state, embed } = buildPanel(await snapshot(ctx));
      const image = asset(`panel-${state}.png`, { versioned: true });
      if (image) embed.setImage(image.url);
      const print = fingerprint(embed.toJSON());
      if (print === last && message) return;
      embed.setTimestamp(new Date());
      const payload = { embeds: [embed], files: image ? [image.file] : [], attachments: [], allowedMentions: { parse: [] } };
      try {
        if (message) message = await message.edit(payload);
        else message = await channel.send(payload);
      } catch {
        // Lo han borrado: se publica de nuevo.
        message = await channel.send(payload);
      }
      last = print;
    } catch (error) {
      log.warn(`No se pudo actualizar el panel: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      busy = false;
    }
  };

  await refresh();
  log.info("Panel del reino activo");
  const timer = setInterval(() => void refresh(), REFRESH_MS);
  return () => {
    clearInterval(timer);
  };
}

async function findPanel(client: Client<true>, channel: SendableChannels): Promise<Message | null> {
  if (!("messages" in channel)) return null;
  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  return recent?.find((m) => m.author.id === client.user.id && m.embeds.some((e) => e.footer?.text === t.footer)) ?? null;
}

/** Lo que importa para saber si hay que editar (sin la fecha). */
function fingerprint(embed: { description?: string; fields?: { name: string; value: string }[]; image?: { url: string } } | undefined): string {
  if (!embed) return "";
  const image = embed.image?.url.split("?")[0]?.split("/").pop() ?? null;
  return JSON.stringify({ d: embed.description ?? null, f: embed.fields ?? [], i: image });
}
