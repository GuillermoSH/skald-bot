/**
 * Resumen semanal: fotos de las estadísticas por jugador y lo que ha cambiado entre
 * una y otra. Sin temática (los textos van aparte).
 */
import type { Database } from "./db.js";
import { METRICS, type MetricId } from "./metrics.js";
import type { PlayerRecord } from "./stats.js";
import { localParts, zonedToUtc } from "./when.js";

/** Lo que se guarda en cada foto (lo que puede salir en el resumen). */
export const WEEKLY_METRICS = [
  "play_time",
  "deaths",
  "mob_kills",
  "blocks_mined",
  "distance",
  "advancements",
  "jumps",
  "chickens",
  "fish",
  "eggs",
  "bells",
  "trades",
  "breeding",
  "logs",
  "diamonds",
  "elytra",
  "broken_tools",
] as const satisfies readonly MetricId[];
export type WeeklyMetric = (typeof WEEKLY_METRICS)[number];

export type Snapshot = Record<string, Partial<Record<WeeklyMetric, number>>>;
export type Deltas = Map<string, Record<WeeklyMetric, number>>;

export function takeSnapshot(players: readonly PlayerRecord[]): Snapshot {
  const out: Snapshot = {};
  for (const p of players) {
    out[p.uuid] = Object.fromEntries(WEEKLY_METRICS.map((m) => [m, METRICS[m].value(p)]));
  }
  return out;
}

/** Lo ganado entre dos fotos (solo lo que sube; quien no estaba antes, desde cero). */
export function weeklyDeltas(prev: Snapshot, curr: Snapshot): Deltas {
  const out: Deltas = new Map();
  for (const [uuid, now] of Object.entries(curr)) {
    const before = prev[uuid] ?? {};
    const row = Object.fromEntries(
      WEEKLY_METRICS.map((m) => [m, Math.max(0, (now[m] ?? 0) - (before[m] ?? 0))]),
    ) as Record<WeeklyMetric, number>;
    if (WEEKLY_METRICS.some((m) => row[m] > 0)) out.set(uuid, row);
  }
  return out;
}

/** El que más tiene de una métrica en la semana, o null si nadie. */
export function topOf(deltas: Deltas, metric: WeeklyMetric): { uuid: string; value: number } | null {
  let best: { uuid: string; value: number } | null = null;
  for (const [uuid, row] of deltas) if (row[metric] > 0 && (!best || row[metric] > best.value)) best = { uuid, value: row[metric] };
  return best;
}

export function totalOf(deltas: Deltas, metric: WeeklyMetric): number {
  let n = 0;
  for (const row of deltas.values()) n += row[metric];
  return n;
}

/** El último domingo a `hour`:00 (hora local) que ya ha pasado. */
export function lastSundayAt(now: Date, timeZone: string, hour: number): Date {
  const today = localParts(now, timeZone);
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay(); // 0 = domingo
  for (const back of [weekday, weekday + 7]) {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day - back));
    const at = zonedToUtc({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour, minute: 0 }, timeZone);
    if (at && at <= now) return at;
  }
  throw new Error("No se pudo calcular el domingo");
}

export class WeeklyStore {
  constructor(private readonly db: Database) {}

  latest(seasonId: number): { takenAt: string; data: Snapshot } | null {
    const r = this.db.get<{ taken_at: string; data: string }>(
      "SELECT taken_at, data FROM weekly_snapshots WHERE season_id = ? ORDER BY taken_at DESC LIMIT 1",
      seasonId,
    );
    return r ? { takenAt: r.taken_at, data: JSON.parse(r.data) as Snapshot } : null;
  }

  save(seasonId: number, takenAt: Date, data: Snapshot): void {
    this.db.run(
      "INSERT OR REPLACE INTO weekly_snapshots (season_id, taken_at, data) VALUES (?, ?, ?)",
      seasonId,
      takenAt.toISOString(),
      JSON.stringify(data),
    );
  }
}
