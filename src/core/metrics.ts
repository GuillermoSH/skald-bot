/**
 * Métricas por jugador para los rankings. Solo cálculos: los nombres y emojis
 * de cada categoría viven en util/texts.ts.
 */
import { stat, sumStats, type PlayerRecord } from "./stats.js";

export type MetricUnit = "count" | "ticks" | "cm";

export interface Metric {
  unit: MetricUnit;
  value(p: PlayerRecord): number;
}

export const METRIC_IDS = [
  "play_time",
  "deaths",
  "mob_kills",
  "blocks_mined",
  "advancements",
  "distance",
  "creeper_deaths",
  "silly_deaths",
  "elytra",
  "chickens",
  "sleep",
  "jumps",
  "survivor",
  "rage_quit",
  "eggs",
  "logs",
  "diamonds",
  "broken_tools",
  "player_kills",
  "fish",
  "trades",
  "breeding",
  "swim",
  "bells",
] as const;

export type MetricId = (typeof METRIC_IDS)[number];

const custom = (key: string) => (p: PlayerRecord) => stat(p, "custom", key);

/** Troncos, madera e hifas (incluidos los descortezados). No cuenta tallos de calabaza, melón, etc. */
export function isLogBlock(key: string): boolean {
  return /_(log|wood|hyphae)$/.test(key) || /(^|[:_])(crimson|warped)_stem$/.test(key);
}

export const METRICS: Readonly<Record<MetricId, Metric>> = {
  play_time: { unit: "ticks", value: custom("play_time") },
  deaths: { unit: "count", value: custom("deaths") },
  mob_kills: { unit: "count", value: custom("mob_kills") },
  blocks_mined: { unit: "count", value: (p) => sumStats(p, "mined") },
  advancements: { unit: "count", value: (p) => p.advancements.length },
  distance: {
    unit: "cm",
    value: (p) => sumStats(p, "custom", (k) => k.endsWith("_one_cm") && k !== "minecraft:fall_one_cm"),
  },
  creeper_deaths: { unit: "count", value: (p) => stat(p, "killed_by", "creeper") },
  // Muertes sin un mob de por medio: caídas, lava, ahogamientos...
  silly_deaths: {
    unit: "count",
    value: (p) => Math.max(0, stat(p, "custom", "deaths") - sumStats(p, "killed_by")),
  },
  elytra: { unit: "cm", value: custom("aviate_one_cm") },
  chickens: { unit: "count", value: (p) => stat(p, "killed", "chicken") },
  sleep: { unit: "count", value: custom("sleep_in_bed") },
  jumps: { unit: "count", value: custom("jump") },
  survivor: { unit: "ticks", value: custom("time_since_death") },
  rage_quit: { unit: "count", value: custom("leave_game") },
  eggs: { unit: "count", value: (p) => stat(p, "used", "egg") },
  logs: { unit: "count", value: (p) => sumStats(p, "mined", isLogBlock) },
  diamonds: {
    unit: "count",
    value: (p) => stat(p, "mined", "diamond_ore") + stat(p, "mined", "deepslate_diamond_ore"),
  },
  broken_tools: { unit: "count", value: (p) => sumStats(p, "broken") },
  player_kills: { unit: "count", value: custom("player_kills") },
  fish: { unit: "count", value: custom("fish_caught") },
  trades: { unit: "count", value: custom("traded_with_villager") },
  breeding: { unit: "count", value: custom("animals_bred") },
  swim: { unit: "cm", value: (p) => stat(p, "custom", "swim_one_cm") + stat(p, "custom", "walk_under_water_one_cm") },
  bells: { unit: "count", value: custom("bell_ring") },
};

export interface RankEntry {
  uuid: string;
  value: number;
}

/** Top `limit` de una métrica, de mayor a menor, sin los que tienen 0. */
export function rank(players: readonly PlayerRecord[], metricId: MetricId, limit = 5): RankEntry[] {
  const metric = METRICS[metricId];
  return players
    .map((p) => ({ uuid: p.uuid, value: metric.value(p) }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}
