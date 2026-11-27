/**
 * «Primeros» de una temporada: quién consiguió antes que nadie cada logro.
 *
 * - `reconcile()` lee los logros de los ficheros del mundo y apunta, sin avisar,
 *   los que aún no estaban (el histórico la primera vez; lo que pasó con el bot
 *   apagado, después). Debe ejecutarse antes de empezar a seguir el log.
 * - `claim()` se llama con cada logro del log en vivo: si nadie lo tenía, lo apunta
 *   y devuelve true (es el primero). Hasta que no se haya leído el histórico al
 *   menos una vez, nunca devuelve true (no hay forma de saberlo).
 *
 * Los logros se identifican por su clave de idioma (`advancementKey`), que sale
 * igual del id del fichero que del título del log.
 */
import type { Database } from "./db.js";
import { advancementKey } from "./lang.js";
import type { Seasons } from "./seasons.js";
import type { PlayerRecord } from "./stats.js";

export interface FirstClaim {
  /** Nombre del jugador (si vino del log) o null. */
  player: string | null;
  /** UUID del jugador (si vino de los ficheros) o null. */
  uuid: string | null;
  at: string;
  /** Se anunció en vivo (no es del histórico). */
  live: boolean;
}

interface FirstRow {
  player_name: string | null;
  player_uuid: string | null;
  at: string;
  live: number;
}

export class FirstsLedger {
  private seededCache: boolean;

  constructor(
    private readonly db: Database,
    private readonly seasons: Seasons,
    readonly seasonId: number,
  ) {
    this.seededCache = seasons.byId(seasonId)?.firstsSeeded ?? false;
  }

  get seeded(): boolean {
    return this.seededCache;
  }

  get size(): number {
    return this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM firsts WHERE season_id = ?", this.seasonId)?.n ?? 0;
  }

  get(key: string): FirstClaim | undefined {
    const r = this.db.get<FirstRow>("SELECT * FROM firsts WHERE season_id = ? AND key = ?", this.seasonId, key);
    return r ? { player: r.player_name, uuid: r.player_uuid, at: r.at, live: r.live === 1 } : undefined;
  }

  /**
   * Cuántos logros consiguió antes que nadie esta persona. Los del histórico se apuntan
   * con el UUID y los del log en vivo con el nombre, así que se cuentan los dos.
   */
  countFor(uuid: string, name: string): number {
    return (
      this.db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM firsts WHERE season_id = ? AND (player_uuid = ? OR LOWER(player_name) = LOWER(?))",
        this.seasonId,
        uuid.toLowerCase(),
        name,
      )?.n ?? 0
    );
  }

  /** Los conseguidos en vivo desde `iso` (para el resumen semanal). */
  liveSince(iso: string): { key: string; player: string; at: string }[] {
    return this.db.all<{ key: string; player_name: string; at: string }>(
      "SELECT key, player_name, at FROM firsts WHERE season_id = ? AND live = 1 AND player_name IS NOT NULL AND at >= ? ORDER BY at",
      this.seasonId,
      iso,
    ).map((r) => ({ key: r.key, player: r.player_name, at: r.at }));
  }

  /** Apunta en silencio lo que haya en los ficheros y no estuviera. Devuelve cuántos nuevos. */
  reconcile(players: readonly PlayerRecord[]): number {
    const earliest = new Map<string, { uuid: string; at: Date }>();
    for (const player of players) {
      for (const adv of player.advancements) {
        if (!adv.doneAt) continue;
        const key = advancementKey(adv.id);
        const best = earliest.get(key);
        if (!best || adv.doneAt < best.at) earliest.set(key, { uuid: player.uuid, at: adv.doneAt });
      }
    }
    const added = this.db.transaction(() => {
      let n = 0;
      for (const [key, { uuid, at }] of earliest) {
        n += this.db.run(
          "INSERT OR IGNORE INTO firsts (season_id, key, player_uuid, player_name, at, live) VALUES (?, ?, ?, NULL, ?, 0)",
          this.seasonId,
          key,
          uuid,
          at.toISOString(),
        ).changes;
      }
      return n;
    });
    if (!this.seededCache) {
      this.seasons.markFirstsSeeded(this.seasonId);
      this.seededCache = true;
    }
    return added;
  }

  /** ¿Es el primero del reino? Si lo es, queda apuntado. */
  claim(key: string, player: string, at: Date): boolean {
    if (!this.seededCache) return false;
    return (
      this.db.run(
        "INSERT OR IGNORE INTO firsts (season_id, key, player_uuid, player_name, at, live) VALUES (?, ?, NULL, ?, ?, 1)",
        this.seasonId,
        key,
        player,
        at.toISOString(),
      ).changes === 1
    );
  }
}
