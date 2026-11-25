/**
 * Lectura (solo lectura) de estadísticas y logros por jugador desde el mundo:
 *   <mundo>/players/stats/<uuid>.json
 *   <mundo>/players/advancements/<uuid>.json
 * Formato verificado en vanilla 26.2. El servidor los reescribe en cada
 * autoguardado (~5 min) y al desconectarse el jugador.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { log } from "../util/log.js";
import { resolveWorldDir } from "./world.js";

const UUID_FILE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/;

/** categoría → clave → valor, con ids completos ("minecraft:custom" → "minecraft:deaths"). */
export type StatsTable = Readonly<Record<string, Readonly<Record<string, number>>>>;

export interface Advancement {
  /** p. ej. "minecraft:nether/explore_nether". */
  id: string;
  /** Fecha del último criterio cumplido. */
  doneAt: Date | null;
}

export interface PlayerRecord {
  uuid: string;
  stats: StatsTable;
  /** Solo logros completados (sin recetas), del más reciente al más antiguo. */
  advancements: readonly Advancement[];
}

/** No se pueden leer los ficheros del mundo (montaje ausente, ruta mal...). */
export class WorldDataUnavailableError extends Error {
  override name = "WorldDataUnavailableError";
}

// ------------------------------------------------------------- utilidades

export function withNamespace(id: string): string {
  return id.includes(":") ? id : `minecraft:${id}`;
}

export function stat(p: PlayerRecord, category: string, key: string): number {
  return p.stats[withNamespace(category)]?.[withNamespace(key)] ?? 0;
}

export function sumStats(p: PlayerRecord, category: string, predicate: (key: string) => boolean = () => true): number {
  let total = 0;
  for (const [key, value] of Object.entries(p.stats[withNamespace(category)] ?? {})) {
    if (predicate(key)) total += value;
  }
  return total;
}

/** La clave con más valor de una categoría (el mob que más le ha matado, el bloque más picado...). */
export function topStat(p: PlayerRecord, category: string): { key: string; value: number } | null {
  let best: { key: string; value: number } | null = null;
  for (const [key, value] of Object.entries(p.stats[withNamespace(category)] ?? {})) {
    if (value > 0 && (!best || value > best.value)) best = { key, value };
  }
  return best;
}

// ------------------------------------------------------------- parsers

const statsFileSchema = z.object({
  stats: z.record(z.string(), z.record(z.string(), z.number())).default({}),
});

export function parseStatsFile(json: unknown): StatsTable {
  return statsFileSchema.parse(json).stats;
}

const advancementEntrySchema = z.object({
  criteria: z.record(z.string(), z.string()).default({}),
  done: z.boolean().default(false),
});

export function parseAdvancementsFile(json: unknown): Advancement[] {
  const raw = z.record(z.string(), z.unknown()).parse(json);
  const done: Advancement[] = [];
  for (const [id, value] of Object.entries(raw)) {
    if (id === "DataVersion" || id.includes(":recipes/")) continue;
    const entry = advancementEntrySchema.safeParse(value);
    if (!entry.success || !entry.data.done) continue;
    const times = Object.values(entry.data.criteria)
      .map(parseMinecraftDate)
      .filter((d): d is Date => d !== null)
      .map((d) => d.getTime());
    done.push({ id, doneAt: times.length > 0 ? new Date(Math.max(...times)) : null });
  }
  return done.sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0));
}

const MC_DATE_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/;

/** "2026-09-09 11:42:48 +0000" → Date. */
export function parseMinecraftDate(value: string): Date | null {
  const m = MC_DATE_RE.exec(value);
  if (!m) return null;
  const date = new Date(`${m[1] ?? ""}T${m[2] ?? ""}${m[3] ?? ""}:${m[4] ?? ""}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ------------------------------------------------------------- servicio

export class WorldStats {
  private cache: { at: number; players: PlayerRecord[] } | null = null;
  private inflight: Promise<PlayerRecord[]> | null = null;
  /** Último dato bueno por jugador, por si se lee un fichero a medio escribir. */
  private readonly lastGood = new Map<string, PlayerRecord>();

  constructor(
    private readonly dataDir: string,
    private readonly ttlMs = 60_000,
    /** Un mundo concreto (p. ej. el de una temporada que se cierra); si no, el actual. */
    private readonly levelName?: string,
  ) {}

  async players(): Promise<PlayerRecord[]> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.players;
    this.inflight ??= this.load().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async load(): Promise<PlayerRecord[]> {
    const playersDir = path.join(await resolveWorldDir(this.dataDir, this.levelName), "players");
    const statsDir = path.join(playersDir, "stats");
    let files: string[];
    try {
      files = await readdir(statsDir);
    } catch (error) {
      throw new WorldDataUnavailableError(`No se puede leer ${statsDir}`, { cause: error });
    }

    const uuids = files.map((f) => UUID_FILE_RE.exec(f)?.[1]).filter((u): u is string => u !== undefined);
    const records = await Promise.all(uuids.map((uuid) => this.loadPlayer(uuid, playersDir)));
    const players = records.filter((r): r is PlayerRecord => r !== null);
    this.cache = { at: Date.now(), players };
    return players;
  }

  private async loadPlayer(uuid: string, playersDir: string): Promise<PlayerRecord | null> {
    try {
      const stats = parseStatsFile(await readJson(path.join(playersDir, "stats", `${uuid}.json`)));
      let advancements: Advancement[] = [];
      try {
        advancements = parseAdvancementsFile(await readJson(path.join(playersDir, "advancements", `${uuid}.json`)));
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
      const record: PlayerRecord = { uuid, stats, advancements };
      this.lastGood.set(uuid, record);
      return record;
    } catch (error) {
      log.warn(`No se pudieron leer los datos de ${uuid}: ${error instanceof Error ? error.message : String(error)}`);
      return this.lastGood.get(uuid) ?? null;
    }
  }
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
