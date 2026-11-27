/**
 * El cielo del reino: hora, día, fase lunar y clima (solo lectura).
 *
 * - Hora: el reloj del overworld (RCON `time query time`, al momento; o, si RCON no
 *   responde, `world_clocks.dat`, que se guarda cada ~5 min). Tick 0 = 6:00.
 * - Clima: `data/minecraft/weather.dat` (se guarda en cada autoguardado).
 * Verificado en 26.2: weather.dat → data.{raining, thundering, rain_time, thunder_time,
 * clear_weather_time}; world_clocks.dat → data["minecraft:overworld"].total_ticks.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readNbt, type NbtValue } from "./nbt.js";
import { resolveWorldDir } from "./world.js";

export const TICKS_PER_DAY = 24_000;

export type DayPeriod = "dawn" | "day" | "dusk" | "night";

export interface ClockInfo {
  /** Día del mundo (empieza en 1). */
  day: number;
  hour: number;
  minute: number;
  period: DayPeriod;
  /** 0 = luna llena, 4 = luna nueva (como en Minecraft). */
  moonPhase: number;
}

export function describeClock(totalTicks: number): ClockInfo {
  const ticks = Math.max(0, Math.floor(totalTicks));
  const dayIndex = Math.floor(ticks / TICKS_PER_DAY);
  const t = ticks % TICKS_PER_DAY;
  const minutesOfDay = Math.floor(((t / 1000) * 60 + 6 * 60) % (24 * 60));
  const period: DayPeriod = t >= 23_000 || t < 1_000 ? "dawn" : t < 12_000 ? "day" : t < 13_000 ? "dusk" : "night";
  return { day: dayIndex + 1, hour: Math.floor(minutesOfDay / 60), minute: minutesOfDay % 60, period, moonPhase: dayIndex % 8 };
}

export interface WeatherInfo {
  raining: boolean;
  thundering: boolean;
  /** Ticks hasta que cambie la lluvia (empiece o pare). */
  rainTicks: number;
  /** Ticks hasta que cambie la tormenta. */
  thunderTicks: number;
  /** Ticks de cielo despejado forzado (/weather clear); 0 si no. */
  clearTicks: number;
}

const num = (v: NbtValue | undefined) => (typeof v === "number" ? v : 0);

function dataOf(root: { [key: string]: NbtValue }): { [key: string]: NbtValue } {
  const data = root.data;
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

export function parseWeather(raw: Buffer): WeatherInfo {
  const d = dataOf(readNbt(raw));
  return {
    raining: num(d.raining) === 1,
    thundering: num(d.thundering) === 1,
    rainTicks: num(d.rain_time),
    thunderTicks: num(d.thunder_time),
    clearTicks: num(d.clear_weather_time),
  };
}

export function parseWorldClock(raw: Buffer): number | null {
  const overworld = dataOf(readNbt(raw))["minecraft:overworld"];
  if (!overworld || typeof overworld !== "object" || Array.isArray(overworld)) return null;
  return typeof overworld.total_ticks === "number" ? overworld.total_ticks : null;
}

async function readWorldFile(dataDir: string, name: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(await resolveWorldDir(dataDir), "data", "minecraft", name));
  } catch {
    return null;
  }
}

/** Clima según el último guardado; null si no hay fichero. */
export async function readWeather(dataDir: string): Promise<WeatherInfo | null> {
  const raw = await readWorldFile(dataDir, "weather.dat");
  return raw ? parseWeather(raw) : null;
}

/** Reloj según el último guardado (respaldo si RCON no responde). */
export async function readWorldClock(dataDir: string): Promise<number | null> {
  const raw = await readWorldFile(dataDir, "world_clocks.dat");
  return raw ? parseWorldClock(raw) : null;
}
