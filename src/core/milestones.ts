/**
 * Hitos personales: cifras redondas de las estadísticas (horas jugadas, km...).
 *
 * `check()` compara las estadísticas de los ficheros del mundo con lo ya apuntado
 * y devuelve los hitos nuevos. La primera vez (y con cada jugador que aparece por
 * primera vez) apunta en silencio lo ya superado, para no anunciar el pasado.
 * Si alguien salta varios de golpe, solo se devuelve el más alto.
 */
import { z } from "zod";
import type { JsonStore } from "./state.js";
import { stat, type PlayerRecord } from "./stats.js";
import { METRICS } from "./metrics.js";

const TICKS_PER_HOUR = 20 * 60 * 60;
const CM_PER_KM = 100_000;

export const MILESTONE_IDS = ["play_time", "distance", "mob_kills", "deaths", "blocks_mined", "dragon", "wither"] as const;
export type MilestoneId = (typeof MILESTONE_IDS)[number];

export interface Milestone {
  /** Valor en la unidad de las cifras (horas, km, unidades). */
  value(p: PlayerRecord): number;
  thresholds: readonly number[];
}

export const MILESTONES: Readonly<Record<MilestoneId, Milestone>> = {
  play_time: { value: (p) => METRICS.play_time.value(p) / TICKS_PER_HOUR, thresholds: [10, 50, 100, 250, 500, 1000] },
  distance: { value: (p) => METRICS.distance.value(p) / CM_PER_KM, thresholds: [10, 100, 500, 1000] },
  mob_kills: { value: (p) => METRICS.mob_kills.value(p), thresholds: [100, 500, 1000, 5000] },
  deaths: { value: (p) => METRICS.deaths.value(p), thresholds: [10, 50, 100] },
  blocks_mined: { value: (p) => METRICS.blocks_mined.value(p), thresholds: [1000, 10_000, 100_000] },
  dragon: { value: (p) => stat(p, "killed", "ender_dragon"), thresholds: [1] },
  wither: { value: (p) => stat(p, "killed", "wither"), thresholds: [1] },
};

/** La cifra más alta superada (0 si ninguna). */
export function reachedThreshold(milestone: Milestone, value: number): number {
  let best = 0;
  for (const t of milestone.thresholds) if (value >= t && t > best) best = t;
  return best;
}

export const milestonesSchema = z.object({
  version: z.literal(1),
  /** uuid → hito → cifra más alta ya apuntada. */
  reached: z.record(z.string(), z.record(z.string(), z.number())),
});
export type MilestonesState = z.infer<typeof milestonesSchema>;
export const emptyMilestones = (): MilestonesState => ({ version: 1, reached: {} });

export interface CrossedMilestone {
  uuid: string;
  id: MilestoneId;
  threshold: number;
}

export class MilestoneTracker {
  private constructor(
    private readonly state: MilestonesState,
    private readonly store: JsonStore<MilestonesState> | null,
  ) {}

  static async open(store: JsonStore<MilestonesState> | null): Promise<MilestoneTracker> {
    return new MilestoneTracker(store ? await store.load() : emptyMilestones(), store);
  }

  async check(players: readonly PlayerRecord[]): Promise<CrossedMilestone[]> {
    const crossed: CrossedMilestone[] = [];
    let changed = false;
    for (const player of players) {
      const known = this.state.reached[player.uuid];
      const reached = known ?? {};
      for (const id of MILESTONE_IDS) {
        const threshold = reachedThreshold(MILESTONES[id], MILESTONES[id].value(player));
        if (threshold <= (reached[id] ?? 0)) continue;
        reached[id] = threshold;
        changed = true;
        // Jugador visto por primera vez: lo que ya tenía no es noticia.
        if (known) crossed.push({ uuid: player.uuid, id, threshold });
      }
      if (!known) {
        this.state.reached[player.uuid] = reached;
        changed = true;
      }
    }
    if (changed) await this.store?.save(this.state);
    return crossed;
  }

  flush(): Promise<void> {
    return this.store?.flush() ?? Promise.resolve();
  }
}
