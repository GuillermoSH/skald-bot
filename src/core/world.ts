import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Nombre del mundo (`level-name` de server.properties; por defecto "world").
 * Algunos cargadores lo cambian; un mundo nuevo suele traer uno distinto.
 */
export async function readLevelName(dataDir: string): Promise<string> {
  try {
    const props = await readFile(path.join(dataDir, "server.properties"), "utf8");
    const value = /^level-name=(.*)$/m.exec(props)?.[1]?.trim();
    if (value && isSafeRelative(value)) return value;
  } catch {
    // Sin server.properties: se usa "world".
  }
  return "world";
}

/** Carpeta del mundo dentro de DATA_DIR (la actual, o la de `levelName` si se indica). */
export async function resolveWorldDir(dataDir: string, levelName?: string): Promise<string> {
  const name = levelName !== undefined && isSafeRelative(levelName) ? levelName : await readLevelName(dataDir);
  return path.join(dataDir, name);
}

/** Evita que un level-name raro saque la lectura fuera de DATA_DIR. */
function isSafeRelative(p: string): boolean {
  return p.length > 0 && !path.isAbsolute(p) && !p.split(/[\\/]/).includes("..");
}
