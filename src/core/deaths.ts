/**
 * Todas las muertes del servidor, de todos los logs (solo lectura): los
 * archivados (`AAAA-MM-DD-n.log.gz`) y `latest.log`. Los archivados no cambian,
 * así que cada uno se lee una vez y se guarda en memoria; `latest.log` se relee
 * si ha cambiado. Solo se guarda quién murió y de qué (nunca líneas del log, que
 * llevan IPs).
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { log } from "../util/log.js";
import type { Translator } from "./lang.js";
import { LogParser } from "./logwatch.js";
import { WorldDataUnavailableError } from "./stats.js";

const gunzipAsync = promisify(gunzip);

const LOG_FILE_RE = /^(\d{4}-\d{2}-\d{2}-\d+\.log\.gz|latest\.log)$/;
/** Un log diario no debería acercarse a esto; si lo hace, se salta. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface DeathRecord {
  player: string;
  combat: boolean;
  /** Plantilla `death.*` (null si no se reconoció). */
  key: string | null;
  /** Asesino en inglés, tal cual sale en el log (null si no hubo). */
  killer: string | null;
}

interface CachedFile {
  size: number;
  mtimeMs: number;
  deaths: DeathRecord[];
}

export class DeathArchive {
  private readonly files = new Map<string, CachedFile>();
  private inflight: Promise<DeathRecord[]> | null = null;

  constructor(
    private readonly dataDir: string,
    private readonly lang: Translator,
  ) {}

  all(): Promise<DeathRecord[]> {
    this.inflight ??= this.load().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async load(): Promise<DeathRecord[]> {
    await this.lang.ready();
    const dir = path.join(this.dataDir, "logs");
    let names: string[];
    try {
      names = (await readdir(dir)).filter((f) => LOG_FILE_RE.test(f)).sort();
    } catch (error) {
      throw new WorldDataUnavailableError(`No se puede leer ${dir}`, { cause: error });
    }
    const out: DeathRecord[] = [];
    for (const name of names) {
      const file = path.join(dir, name);
      try {
        const info = await stat(file);
        let cached = this.files.get(name);
        if (!cached || cached.size !== info.size || cached.mtimeMs !== info.mtimeMs) {
          if (info.size > MAX_FILE_BYTES) {
            log.warn(`Log demasiado grande, se salta para /hel: ${name}`);
            continue;
          }
          const raw = await readFile(file);
          const text = name.endsWith(".gz") ? (await gunzipAsync(raw)).toString("utf8") : raw.toString("utf8");
          cached = { size: info.size, mtimeMs: info.mtimeMs, deaths: parseDeaths(text, this.lang) };
          this.files.set(name, cached);
        }
        out.push(...cached.deaths);
      } catch (error) {
        log.warn(`No se pudo leer ${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return out;
  }
}

export function parseDeaths(text: string, lang: Translator): DeathRecord[] {
  const parser = new LogParser(lang);
  const now = new Date();
  const deaths: DeathRecord[] = [];
  for (const line of text.split("\n")) {
    const event = parser.parse(line, now);
    if (event?.type !== "death") continue;
    deaths.push({ player: event.player, combat: event.combat, key: event.cause?.key ?? null, killer: event.cause?.killer ?? null });
  }
  return deaths;
}

export interface CauseCount {
  /** El asesino (en inglés, del log) si fue en combate; si no, la plantilla. */
  killer: string | null;
  key: string | null;
  count: number;
}

/** Causas de mayor a menor. En combate se agrupa por asesino; si no, por plantilla. */
export function rankCauses(deaths: readonly DeathRecord[], player?: string): CauseCount[] {
  const wanted = player?.toLowerCase();
  const groups = new Map<string, CauseCount>();
  for (const d of deaths) {
    if (wanted && d.player.toLowerCase() !== wanted) continue;
    const id = d.killer ? `killer:${d.killer.toLowerCase()}` : `key:${d.key ?? "?"}`;
    const group = groups.get(id) ?? { killer: d.killer, key: d.killer ? null : d.key, count: 0 };
    group.count++;
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
