import { readdir } from "node:fs/promises";
import path from "node:path";
import { fabricAdapter } from "./fabric.js";
import type { DetectionInput, ServerAdapter } from "./types.js";
import { vanillaAdapter } from "./vanilla.js";

/** De más específico a menos. Vanilla siempre al final: es la base común. */
const ADAPTERS: readonly ServerAdapter[] = [fabricAdapter, vanillaAdapter];

/** Lo que hay en la raíz de DATA_DIR y los .jar de mods/ (solo lectura; vacío si no se puede leer). */
export async function scanServerFiles(dataDir: string): Promise<{ dataFiles: string[]; modJars: string[] }> {
  const list = (dir: string) => readdir(dir).catch(() => [] as string[]);
  const [dataFiles, mods] = await Promise.all([list(dataDir), list(path.join(dataDir, "mods"))]);
  return { dataFiles, modJars: mods.filter((f) => f.endsWith(".jar")) };
}

export function detectAdapter(input: DetectionInput): ServerAdapter {
  return ADAPTERS.find((adapter) => adapter.detect(input)) ?? vanillaAdapter;
}
