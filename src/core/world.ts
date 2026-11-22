import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Carpeta del mundo dentro de DATA_DIR. Sale de `level-name` en
 * server.properties (por defecto "world"); algunos cargadores la cambian.
 */
export async function resolveWorldDir(dataDir: string): Promise<string> {
  let levelName = "world";
  try {
    const props = await readFile(path.join(dataDir, "server.properties"), "utf8");
    const value = /^level-name=(.*)$/m.exec(props)?.[1]?.trim();
    if (value && isSafeRelative(value)) levelName = value;
  } catch {
    // Sin server.properties: se usa "world".
  }
  return path.join(dataDir, levelName);
}

/** Evita que un level-name raro saque la lectura fuera de DATA_DIR. */
function isSafeRelative(p: string): boolean {
  return !path.isAbsolute(p) && !p.split(/[\\/]/).includes("..");
}
