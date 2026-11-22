import { readFile } from "node:fs/promises";
import path from "node:path";
import { jarEnglishLoader, Translator } from "../src/core/lang.js";

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
