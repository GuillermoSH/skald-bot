import { readFile } from "node:fs/promises";
import path from "node:path";
import { Database } from "../src/core/db.js";
import { jarEnglishLoader, Translator } from "../src/core/lang.js";
import { Seasons } from "../src/core/seasons.js";

export const FIXTURE_DATA = path.resolve("test/fixtures/data");

/** Traductor con el jar sintético (en_us) y un extracto real de es_es. */
export async function fixtureTranslator(): Promise<Translator> {
  const es = JSON.parse(await readFile("test/fixtures/lang-es-subset.json", "utf8")) as Record<string, string>;
  const tr = new Translator(
    () => Promise.resolve("26.2"),
    () => Promise.resolve(new Map(Object.entries(es))),
    jarEnglishLoader(FIXTURE_DATA),
  );
  await tr.ready();
  return tr;
}

/** Base de datos en memoria, al día, con una temporada abierta. */
export function memoryRealm(): { db: Database; seasons: Seasons; seasonId: number } {
  const db = new Database(":memory:");
  db.migrate();
  const seasons = new Seasons(db);
  const seasonId = seasons.open("Era I", "world", null, new Date("2026-09-01T00:00:00Z")).id;
  return { db, seasons, seasonId };
}
