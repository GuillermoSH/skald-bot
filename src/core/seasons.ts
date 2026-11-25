/**
 * Temporadas: una temporada es un mundo. Lo «de partida» (primeros del reino,
 * hitos, monedas ganadas) se apunta con la temporada; lo de la persona, no.
 *
 * Skald nunca cambia de temporada solo: si el `level-name` del servidor deja de
 * coincidir con el de la temporada abierta, lo dice (`detect`) y espera a que un
 * administrador abra la nueva. Mientras, lo de partida queda en pausa.
 */
import type { Database } from "./db.js";

export interface Season {
  id: number;
  name: string;
  levelName: string;
  loader: string;
  startedAt: string;
  endedAt: string | null;
  firstsSeeded: boolean;
  /** Ranking final (JSON) que se guardó al cerrarla. */
  finalRanking: string | null;
}

interface SeasonRow {
  id: number;
  name: string;
  level_name: string;
  loader: string;
  started_at: string;
  ended_at: string | null;
  firsts_seeded: number;
  final_ranking: string | null;
}

const toSeason = (r: SeasonRow): Season => ({
  id: r.id,
  name: r.name,
  levelName: r.level_name,
  loader: r.loader,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  firstsSeeded: r.firsts_seeded === 1,
  finalRanking: r.final_ranking,
});

export type SeasonCheck =
  | { status: "ok"; season: Season }
  /** No había ninguna: se ha abierto la primera con el mundo actual. */
  | { status: "created"; season: Season }
  /** El servidor tiene otro mundo: hay que abrir temporada (lo decide un admin). */
  | { status: "mismatch"; season: Season; levelName: string };

export class Seasons {
  constructor(private readonly db: Database) {}

  current(): Season | null {
    const row = this.db.get<SeasonRow>("SELECT * FROM seasons WHERE ended_at IS NULL");
    return row ? toSeason(row) : null;
  }

  byId(id: number): Season | null {
    const row = this.db.get<SeasonRow>("SELECT * FROM seasons WHERE id = ?", id);
    return row ? toSeason(row) : null;
  }

  /** De la más reciente a la más antigua. */
  list(): Season[] {
    return this.db.all<SeasonRow>("SELECT * FROM seasons ORDER BY id DESC").map(toSeason);
  }

  get count(): number {
    return this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM seasons")?.n ?? 0;
  }

  /**
   * Compara con el mundo actual del servidor. Si no hay ninguna temporada, abre
   * la primera con `firstName` (no hay nada que decidir todavía).
   */
  detect(levelName: string, firstName: string, now = new Date()): SeasonCheck {
    const season = this.current();
    if (!season) return { status: "created", season: this.open(firstName, levelName, null, now) };
    if (season.levelName !== levelName) return { status: "mismatch", season, levelName };
    return { status: "ok", season };
  }

  /** Cierra la abierta (con su ranking final) y abre otra. */
  open(name: string, levelName: string, finalRanking: unknown, now = new Date(), loader = "vanilla"): Season {
    const at = now.toISOString();
    const id = this.db.transaction(() => {
      this.db.run(
        "UPDATE seasons SET ended_at = ?, final_ranking = ? WHERE ended_at IS NULL",
        at,
        finalRanking === null ? null : JSON.stringify(finalRanking),
      );
      return this.db.run(
        "INSERT INTO seasons (name, level_name, loader, started_at) VALUES (?, ?, ?, ?)",
        name,
        levelName,
        loader,
        at,
      ).lastId;
    });
    const season = this.byId(id);
    if (!season) throw new Error("No se pudo abrir la temporada");
    return season;
  }

  markFirstsSeeded(id: number): void {
    this.db.run("UPDATE seasons SET firsts_seeded = 1 WHERE id = ?", id);
  }
}
