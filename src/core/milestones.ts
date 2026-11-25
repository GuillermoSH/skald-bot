/**
 * Hitos personales: cifras redondas de las estadísticas (horas jugadas, km...).
 *
 * `check()` compara las estadísticas de los ficheros del mundo con lo ya apuntado
 * (por temporada) y devuelve los hitos nuevos. La primera vez (y con cada jugador que aparece por
 * primera vez) apunta en silencio lo ya superado, para no anunciar el pasado.
 * Si alguien salta varios de golpe, solo se devuelve el más alto.
 */
import type { Database } from "./db.js";
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

export interface CrossedMilestone {
  uuid: string;
  id: MilestoneId;
  threshold: number;
}

/** Marca de «jugador ya visto» (aunque no haya superado ninguna cifra). */
const SEEN = "__seen";

export class MilestoneTracker {
  constructor(
    private readonly db: Database,
    readonly seasonId: number,
  ) {}

  check(players: readonly PlayerRecord[]): CrossedMilestone[] {
    return this.db.transaction(() => {
      const crossed: CrossedMilestone[] = [];
      for (const player of players) {
        const rows = this.db.all<{ milestone_id: string; threshold: number }>(
          "SELECT milestone_id, threshold FROM milestones WHERE season_id = ? AND uuid = ?",
          this.seasonId,
          player.uuid,
        );
        const reached = new Map(rows.map((r) => [r.milestone_id, r.threshold]));
        // Jugador visto por primera vez: lo que ya tenía no es noticia.
        const known = reached.has(SEEN);
        if (!known) this.save(player.uuid, SEEN, 0);
        for (const id of MILESTONE_IDS) {
          const threshold = reachedThreshold(MILESTONES[id], MILESTONES[id].value(player));
          if (threshold <= (reached.get(id) ?? 0)) continue;
          this.save(player.uuid, id, threshold);
          if (known) crossed.push({ uuid: player.uuid, id, threshold });
        }
      }
      return crossed;
    });
  }

  private save(uuid: string, id: string, threshold: number): void {
    this.db.run(
      "INSERT INTO milestones (season_id, uuid, milestone_id, threshold) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET threshold = excluded.threshold",
      this.seasonId,
      uuid,
      id,
      threshold,
    );
  }
}
