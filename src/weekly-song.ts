/**
 * Canto del domingo: cada domingo a las 20:00 (TIMEZONE), resumen de la semana en el
 * canal de los logros. Si Skald estaba apagado a esa hora, lo canta al volver. La
 * primera vez solo hace la foto (el primer canto llega el domingo siguiente).
 */
import type { Client } from "discord.js";
import { alertChannelFor } from "./alerts.js";
import type { CommandContext } from "./commands/types.js";
import { lastSundayAt, takeSnapshot, topOf, totalOf, weeklyDeltas, type Deltas, type WeeklyMetric } from "./core/weekly.js";
import { asset } from "./util/assets.js";
import { fetchSendableChannel } from "./util/channels.js";
import { baseEmbed } from "./util/embeds.js";
import { safeText } from "./util/escape.js";
import { formatCount } from "./util/format.js";
import { log } from "./util/log.js";
import { texts } from "./util/texts.js";

const t = texts.weekly;
const SONG_HOUR = 20;
const CHECK_MS = 10 * 60_000;
const POSTED_KEY = "weekly_posted_at";
const TICKS_PER_HOUR = 72_000;
const CURIOUS: readonly (keyof typeof t.curious)[] = ["chickens", "jumps", "fish", "eggs", "bells", "trades", "breeding", "logs", "diamonds", "elytra", "broken_tools"];

type NameOf = (uuid: string) => string;

/** Las líneas del canto (sin la cabecera). Vacío si no pasó nada. */
export function weeklyLines(deltas: Deltas, nameOf: NameOf, extra: { firsts: string[]; coins: { uuid: string; coins: number } | null }): string[] {
  if (deltas.size === 0 && extra.firsts.length === 0) return [];
  const lines: string[] = [];
  const top = (m: WeeklyMetric) => topOf(deltas, m);
  const fmt = formatCount;

  const play = top("play_time");
  if (play) lines.push(t.hours(fmt(Math.round(totalOf(deltas, "play_time") / TICKS_PER_HOUR)), nameOf(play.uuid), fmt(Math.round(play.value / TICKS_PER_HOUR))));
  const kills = top("mob_kills");
  if (kills) lines.push(t.kills(nameOf(kills.uuid), fmt(kills.value)));
  const mined = top("blocks_mined");
  if (mined) lines.push(t.mined(nameOf(mined.uuid), fmt(mined.value)));
  const dist = top("distance");
  if (dist && dist.value >= 100_000) lines.push(t.distance(nameOf(dist.uuid), fmt(Math.round(dist.value / 100_000))));
  const deaths = top("deaths");
  lines.push(deaths ? t.deaths(fmt(totalOf(deltas, "deaths")), nameOf(deaths.uuid), fmt(deaths.value)) : t.noDeaths);
  const adv = top("advancements");
  if (adv) lines.push(t.advancements(fmt(totalOf(deltas, "advancements")), nameOf(adv.uuid), fmt(adv.value)));
  if (extra.firsts.length > 0) lines.push(t.firsts(extra.firsts.slice(0, 5).join(", ")));
  if (extra.coins) lines.push(t.coins(nameOf(extra.coins.uuid), fmt(extra.coins.coins)));

  // Dato curioso: el de más movimiento entre los raros (élitros, en km).
  let curious: { metric: keyof typeof t.curious; uuid: string; value: number } | null = null;
  for (const m of CURIOUS) {
    const best = top(m);
    const value = best ? (m === "elytra" ? Math.floor(best.value / 100_000) : best.value) : 0;
    if (best && value > 0 && (!curious || value > curious.value)) curious = { metric: m, uuid: best.uuid, value };
  }
  if (curious) lines.push(t.curious[curious.metric](`**${nameOf(curious.uuid)}**`, fmt(curious.value)));
  return lines;
}

export function startWeeklySong(client: Client<true>, ctx: CommandContext): () => void {
  const channelId = alertChannelFor(ctx.config).get("advancement");
  if (!channelId) return () => undefined;
  let busy = false;

  const check = async () => {
    const store = ctx.realm.weekly;
    const active = ctx.realm.activeSeason;
    if (busy || !store || !active) return;
    busy = true;
    try {
      const now = new Date();
      const due = lastSundayAt(now, ctx.config.TIMEZONE, SONG_HOUR);
      const posted = ctx.realm.getMeta(POSTED_KEY);
      if (posted && posted >= due.toISOString()) return;

      const players = await ctx.world.players();
      const curr = takeSnapshot(players);
      const prev = store.latest(active.season.id);
      if (!prev) {
        store.save(active.season.id, now, curr);
        ctx.realm.setMeta(POSTED_KEY, due.toISOString());
        log.info("Canto del domingo: primera foto de la semana (el primer canto, el domingo que viene)");
        return;
      }

      const deltas = weeklyDeltas(prev.data, curr);
      const names = await ctx.names.resolve([...deltas.keys()]);
      const nameOf: NameOf = (uuid) => safeText(names.get(uuid) ?? texts.unknownWarrior(uuid), 32);
      await ctx.lang.ready();
      const firsts = active.firsts.liveSince(prev.takenAt).map((f) => t.firstItem(safeText(f.player, 32), safeText(ctx.lang.fromKey(f.key), 60)));
      const coins = ctx.realm.economy?.earnedSince(prev.takenAt, 1)[0] ?? null;
      const lines = weeklyLines(deltas, nameOf, { firsts, coins });

      const channel = await fetchSendableChannel(client, channelId, "canto del domingo");
      if (!channel) return;
      const embed = baseEmbed()
        .setTitle(t.title)
        .setDescription([t.intro(safeText(active.season.name, 40)), "", ...(lines.length > 0 ? lines : [t.quiet]), "", t.footer].join("\n"));
      const image = asset("canto.gif");
      if (image) embed.setImage(image.url);
      await channel.send({ embeds: [embed], files: image ? [image.file] : [], allowedMentions: { parse: [] } });
      store.save(active.season.id, now, curr);
      ctx.realm.setMeta(POSTED_KEY, due.toISOString());
      log.info("Canto del domingo publicado");
    } catch (error) {
      log.warn(`Canto del domingo: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      busy = false;
    }
  };

  void check();
  const timer = setInterval(() => void check(), CHECK_MS);
  return () => {
    clearInterval(timer);
  };
}
