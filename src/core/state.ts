/**
 * Estado propio de Skald (lo que tiene que recordar entre reinicios), en ficheros
 * JSON dentro de STATE_DIR. **Nunca** dentro de la carpeta del mundo.
 *
 * - Escritura atómica: se escribe a un temporal y se renombra, así un corte a
 *   medias no deja un fichero roto.
 * - Las escrituras de un mismo fichero van en fila (nunca dos a la vez).
 * - Si el fichero está roto, se aparta como `.corrupt-<fecha>` (no se pierde) y
 *   se empieza de cero.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { log } from "../util/log.js";

export class JsonStore<T> {
  private queue: Promise<void> = Promise.resolve();
  private warned = false;

  constructor(
    readonly file: string,
    private readonly schema: z.ZodType<T>,
    private readonly empty: () => T,
  ) {}

  async load(): Promise<T> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (error) {
      if (isNotFound(error)) return this.empty();
      throw error;
    }
    const parsed = this.schema.safeParse(safeJson(raw));
    if (parsed.success) return parsed.data;

    const aside = `${this.file}.corrupt-${new Date().toISOString().replaceAll(":", "-")}`;
    await rename(this.file, aside).catch(() => undefined);
    log.warn(`Estado ilegible en ${path.basename(this.file)}; apartado como ${path.basename(aside)} y se empieza de cero`);
    return this.empty();
  }

  /** Guarda (en fila con las escrituras anteriores). Si falla, avisa una vez y sigue. */
  save(value: T): Promise<void> {
    const json = `${JSON.stringify(value, null, 2)}\n`;
    this.queue = this.queue.then(async () => {
      try {
        await mkdir(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.tmp`;
        await writeFile(tmp, json, "utf8");
        await rename(tmp, this.file);
        this.warned = false;
      } catch (error) {
        if (!this.warned) {
          log.warn(`No se pudo guardar ${path.basename(this.file)} (¿STATE_DIR montado y con permisos?): ${error instanceof Error ? error.message : String(error)}`);
          this.warned = true;
        }
      }
    });
    return this.queue;
  }

  flush(): Promise<void> {
    return this.queue;
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
