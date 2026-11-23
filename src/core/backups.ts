/**
 * Estado de las copias de seguridad (solo lectura: nombres, tamaños y fechas;
 * nunca se abre, crea ni borra ninguna copia). Formato de itzg/mc-backup:
 * `world-AAAAMMDD-HHMMSS.tar.gz`, una cada noche. Verificado en el M700.
 */
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const BACKUP_RE = /^.+-\d{8}-\d{6}\.(?:tar\.gz|tgz|tar\.zst|tar\.lz4|tar|zip)$/;

/** Una copia que aún se está escribiendo no se juzga por su tamaño. */
export const SETTLE_MS = 10 * 60_000;
/** Por debajo de esta fracción del tamaño de la anterior, la copia es sospechosa. */
export const SMALL_RATIO = 0.5;

export interface BackupFile {
  name: string;
  size: number;
  mtime: Date;
}

export class BackupsUnavailableError extends Error {
  override name = "BackupsUnavailableError";
}

/** Copias de la carpeta, de la más reciente a la más antigua. */
export async function listBackups(dir: string): Promise<BackupFile[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    throw new BackupsUnavailableError(`No se puede leer ${dir}`, { cause: error });
  }
  const files = await Promise.all(
    names
      .filter((n) => BACKUP_RE.test(n))
      .map(async (name) => {
        const info = await stat(path.join(dir, name));
        return info.isFile() ? { name, size: info.size, mtime: info.mtime } : null;
      }),
  );
  return files.filter((f): f is BackupFile => f !== null).sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

export type BackupStatus = "ok" | "none" | "stale" | "small";

export interface BackupHealth {
  status: BackupStatus;
  latest: BackupFile | null;
  previous: BackupFile | null;
  totalSize: number;
  count: number;
}

export function assessBackups(files: readonly BackupFile[], now: Date, maxAgeMs: number): BackupHealth {
  const [latest = null, previous = null] = files;
  const base = { latest, previous, count: files.length, totalSize: files.reduce((n, f) => n + f.size, 0) };
  if (!latest) return { status: "none", ...base };
  const age = now.getTime() - latest.mtime.getTime();
  if (age > maxAgeMs) return { status: "stale", ...base };
  const settled = age >= SETTLE_MS;
  if (settled && previous && latest.size < previous.size * SMALL_RATIO) return { status: "small", ...base };
  return { status: "ok", ...base };
}
