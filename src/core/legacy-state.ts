/**
 * Migración única de los JSON de la primera versión del estado (firsts.json,
 * milestones.json) a la base de datos, dentro de la temporada indicada. Tras
 * pasarlos, se renombran a `.migrated` (no se borran).
 */
import { readFile, rename } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { log } from "../util/log.js";
import type { Database } from "./db.js";
import type { Seasons } from "./seasons.js";

const firstsSchema = z.object({
  seeded: z.boolean(),
  claims: z.record(
    z.string(),
    z.object({ player: z.string().nullable(), uuid: z.string().nullable(), at: z.string(), live: z.boolean() }),
  ),
});

const milestonesSchema = z.object({
  reached: z.record(z.string(), z.record(z.string(), z.number())),
});

async function readLegacy(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

/** Devuelve cuántas filas pasó (0 si no había nada que migrar). */
export async function migrateLegacyState(db: Database, seasons: Seasons, stateDir: string, seasonId: number): Promise<number> {
  let moved = 0;

  const firstsFile = path.join(stateDir, "firsts.json");
  const firsts = firstsSchema.safeParse(await readLegacy(firstsFile));
  if (firsts.success) {
    db.transaction(() => {
      for (const [key, c] of Object.entries(firsts.data.claims)) {
        moved += db.run(
          "INSERT OR IGNORE INTO firsts (season_id, key, player_uuid, player_name, at, live) VALUES (?, ?, ?, ?, ?, ?)",
          seasonId,
          key,
          c.uuid,
          c.player,
          c.at,
          c.live ? 1 : 0,
        ).changes;
      }
    });
    if (firsts.data.seeded) seasons.markFirstsSeeded(seasonId);
    await rename(firstsFile, `${firstsFile}.migrated`);
  }

  const milestonesFile = path.join(stateDir, "milestones.json");
  const milestones = milestonesSchema.safeParse(await readLegacy(milestonesFile));
  if (milestones.success) {
    db.transaction(() => {
      for (const [uuid, reached] of Object.entries(milestones.data.reached)) {
        // Jugador ya visto (para que lo anterior no se anuncie).
        moved += db.run(
          "INSERT OR IGNORE INTO milestones (season_id, uuid, milestone_id, threshold) VALUES (?, ?, '__seen', 0)",
          seasonId,
          uuid,
        ).changes;
        for (const [id, threshold] of Object.entries(reached)) {
          moved += db.run(
            "INSERT OR IGNORE INTO milestones (season_id, uuid, milestone_id, threshold) VALUES (?, ?, ?, ?)",
            seasonId,
            uuid,
            id,
            threshold,
          ).changes;
        }
      }
    });
    await rename(milestonesFile, `${milestonesFile}.migrated`);
  }

  if (moved > 0) log.info(`Estado antiguo (JSON) pasado a la base de datos: ${moved} filas`);
  return moved;
}
