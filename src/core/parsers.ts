/**
 * Convierte las respuestas de texto de RCON en objetos tipados.
 *
 * Son funciones puras: se prueban con respuestas reales guardadas en
 * test/fixtures. Si una versión nueva del juego cambia el formato, aquí es
 * donde se nota (lanzan RconParseError en vez de devolver basura).
 *
 * Formato verificado contra vanilla 26.2. Ojo: RCON concatena los mensajes
 * de un mismo comando SIN separador, por eso no se parte por líneas.
 */

export class RconParseError extends Error {
  override name = "RconParseError";
  constructor(
    readonly command: string,
    readonly response: string,
  ) {
    super(`Respuesta inesperada de RCON a «${command}»: ${JSON.stringify(response.slice(0, 200))}`);
  }
}

const NUMBER = String.raw`(\d+(?:\.\d+)?)`;

// ---------------------------------------------------------------- list

export interface PlayerList {
  online: number;
  max: number;
  names: string[];
}

const LIST_RE = /^There are (\d+) of a max of (\d+) players online:\s?(.*)$/s;

export function parseList(response: string): PlayerList {
  const match = LIST_RE.exec(response);
  if (!match) throw new RconParseError("list", response);
  const [, online, max, rest = ""] = match;
  const names = rest
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return { online: Number(online), max: Number(max), names };
}

// ---------------------------------------------------------------- tick

export type TickState = "normal" | "lagging" | "frozen" | "sprinting";

export interface TickInfo {
  state: TickState;
  /** Ticks por segundo objetivo (20 por defecto). */
  targetRate: number;
  /** Milisegundos medios por tick (MSPT). */
  averageMs: number;
  /** Presupuesto por tick en ms (50 a 20 TPS). No aparece al hacer sprint. */
  targetMs: number | null;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  sample: number;
}

const TICK_STATES: readonly [string, TickState][] = [
  // El orden importa: «running, but can't keep up» antes que «running normally».
  ["The game is running, but can't keep up with the target tick rate", "lagging"],
  ["The game is running normally", "normal"],
  ["The game is frozen", "frozen"],
  ["The game is sprinting", "sprinting"],
];

const TICK_RATE_RE = new RegExp(String.raw`Target tick rate: ${NUMBER} per second`);
const TICK_AVG_RE = new RegExp(String.raw`Average time per tick: ${NUMBER}ms(?: \(Target: ${NUMBER}ms\))?`);
const TICK_PCT_RE = new RegExp(
  String.raw`Percentiles: P50: ${NUMBER}ms P95: ${NUMBER}ms P99: ${NUMBER}ms[.,] Sample: (\d+)`,
  "i",
);

export function parseTickQuery(response: string): TickInfo {
  const state = TICK_STATES.find(([prefix]) => response.startsWith(prefix))?.[1];
  const rate = TICK_RATE_RE.exec(response);
  const avg = TICK_AVG_RE.exec(response);
  const pct = TICK_PCT_RE.exec(response);
  if (!state || !rate || !avg || !pct) throw new RconParseError("tick query", response);

  return {
    state,
    targetRate: Number(rate[1]),
    averageMs: Number(avg[1]),
    targetMs: avg[2] === undefined ? null : Number(avg[2]),
    p50Ms: Number(pct[1]),
    p95Ms: Number(pct[2]),
    p99Ms: Number(pct[3]),
    sample: Number(pct[4]),
  };
}

// ---------------------------------------------------------------- version

export interface VersionInfo {
  /** Nombre de la versión, p. ej. "26.2". */
  name: string;
  /** Versión de datos del mundo (DataVersion). */
  dataVersion: number | null;
  protocol: number | null;
  buildTime: string | null;
  resourcePack: string | null;
  dataPack: string | null;
  stable: boolean | null;
}

const VERSION_KEYS = ["id", "name", "data", "series", "protocol", "build_time", "pack_resource", "pack_data", "stable"];
const VERSION_SPLIT_RE = new RegExp(`(${VERSION_KEYS.join("|")}) = `, "g");

/**
 * `version` en vanilla: «Server version info:id = 26.2name = 26.2data = 4903...».
 * Las parejas clave = valor van pegadas, así que se parte por las claves conocidas.
 * Otros cargadores (Paper...) contestan otra cosa: entonces lanza RconParseError.
 */
export function parseVersion(response: string): VersionInfo {
  if (!response.startsWith("Server version info:")) throw new RconParseError("version", response);
  const parts = response.slice("Server version info:".length).split(VERSION_SPLIT_RE);
  const fields = new Map<string, string>();
  // split con grupo de captura: ["", clave, valor, clave, valor, ...]
  for (let i = 1; i + 1 < parts.length; i += 2) fields.set(parts[i] ?? "", (parts[i + 1] ?? "").trim());

  const name = fields.get("name");
  if (!name) throw new RconParseError("version", response);
  const int = (key: string) => {
    const n = Number.parseInt(fields.get(key) ?? "", 10);
    return Number.isFinite(n) ? n : null;
  };
  const stable = fields.get("stable");
  return {
    name,
    dataVersion: int("data"),
    protocol: int("protocol"),
    buildTime: fields.get("build_time") ?? null,
    resourcePack: fields.get("pack_resource") ?? null,
    dataPack: fields.get("pack_data") ?? null,
    stable: stable === undefined ? null : stable === "yes",
  };
}
