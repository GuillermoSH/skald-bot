import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Economy } from "../src/core/economy.js";
import { LiveStats, objectiveName, parseScores, startupCommands } from "../src/core/live.js";
import { buildScoresQuery } from "../src/core/rcon.js";
import type { PlayerRecord } from "../src/core/stats.js";
import { DailyTasks, liveTerms, TASKS } from "../src/core/tasks.js";
import { memoryRealm } from "./helpers.js";

const KILLS = "sk.c.mob_kills";
const T0 = new Date("2026-12-01T10:00:00Z");
const T1 = new Date("2026-12-01T10:05:00Z");
const terms = [{ category: "custom", key: "mob_kills" }] as const;

describe("marcadores en vivo", () => {
  it("lee la respuesta de scoreboard players list (26.2), solo los de Skald", () => {
    const s = parseScores("Ragnar has 3 score(s):[sk.k.zombie]: 7[afkDis.z1]: 4[sk.c.mob_kills]: 12");
    expect([...s]).toEqual([["sk.k.zombie", 7], [KILLS, 12]]);
    expect(parseScores("Ragnar has no scores to show").size).toBe(0);
  });

  it("plantilla cerrada: solo nombres de jugador válidos", () => {
    expect(buildScoresQuery("Ragnar_1")).toBe("scoreboard players list Ragnar_1");
    expect(() => buildScoresQuery("@a")).toThrow();
    expect(() => buildScoresQuery("x; op Loki")).toThrow();
  });

  it("suma lo subido desde el último guardado, y al llegar un fichero nuevo vuelve a cero", () => {
    const live = new LiveStats();
    live.update("a", T0, new Map([[KILLS, 100]]));
    expect(live.extra("a", T0, terms)).toBe(0);
    live.update("a", T0, new Map([[KILLS, 130]]));
    expect(live.extra("a", T0, terms)).toBe(30);
    // El fichero nuevo ya trae esos 30: no se cuentan otra vez.
    expect(live.extra("a", T1, terms)).toBe(0);
    live.update("a", T1, new Map([[KILLS, 131]]));
    expect(live.extra("a", T1, terms)).toBe(0);
  });

  it("un marcador que aparece cuenta desde 0; si se recrea, nunca cuenta de más", () => {
    const live = new LiveStats();
    live.update("a", T0, new Map());
    live.update("a", T0, new Map([[KILLS, 5]]));
    expect(live.extra("a", T0, terms)).toBe(5);
    live.update("a", T0, new Map([[KILLS, 2]]));
    expect(live.extra("a", T0, terms)).toBeLessThanOrEqual(2);
  });

  it("todas las misiones tienen marcadores con nombres válidos, y la plantilla del mundo los crea todos", () => {
    expect(TASKS.every((t) => (t.live ?? []).length > 0)).toBe(true);
    const commands = startupCommands(liveTerms());
    expect(new Set(commands).size).toBe(commands.length);
    for (const term of liveTerms()) expect(objectiveName(term)).toMatch(/^sk\.[ckm]\.[a-z0-9_]+$/);
    const readme = readFileSync("deploy/minecraft/README.md", "utf8");
    for (const c of commands) expect(readme).toContain(c);
  });
});

describe("misiones con marcadores", () => {
  const record = (n: number, savedAt: Date): PlayerRecord => ({
    uuid: "a",
    stats: { "minecraft:custom": { "minecraft:mob_kills": n } },
    advancements: [],
    savedAt,
  });

  it("se cumplen con lo del marcador sin esperar al guardado, y no se pagan dos veces", () => {
    const { db, seasonId } = memoryRealm();
    const economy = new Economy(db, seasonId, "UTC");
    const live = new LiveStats();
    const easy = TASKS.findIndex((t) => t.id === "kill_mobs_easy");
    const tasks = new DailyTasks(db, "UTC", economy, (max) => (max > easy ? easy : 0) % max, live);

    live.update("a", T0, new Map([[KILLS, 0]]));
    expect(tasks.tick([record(500, T0)], T0)).toEqual([]);
    // 30 mobs en el marcador, el fichero sigue igual.
    live.update("a", T0, new Map([[KILLS, 30]]));
    const events = tasks.tick([record(500, T0)], T0);
    expect(events.map((e) => e.task.id)).toEqual(["kill_mobs_easy"]);
    // Llega el guardado con esos 30 dentro: nada nuevo.
    expect(tasks.tick([record(530, T1)], T1)).toEqual([]);
  });
});
