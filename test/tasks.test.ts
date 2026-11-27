import { describe, expect, it } from "vitest";
import { DailyTasks, streakBonus, TASK_REWARD, tasksForDay } from "../src/core/tasks.js";
import type { PlayerRecord } from "../src/core/stats.js";
import { memoryRealm } from "./helpers.js";

/** Jugador con todas las estadísticas que usan las misiones a `n` (y las de distancia en cm). */
function player(uuid: string, n: number): PlayerRecord {
  const custom = {
    "minecraft:mob_kills": n,
    "minecraft:fish_caught": n,
    "minecraft:sleep_in_bed": n,
    "minecraft:animals_bred": n,
    "minecraft:traded_with_villager": n,
    "minecraft:walk_one_cm": n * 100_000,
  };
  const mobs = ["zombie", "skeleton", "creeper", "enderman"];
  const blocks = ["stone", "oak_log", "iron_ore", "diamond_ore"];
  return {
    uuid,
    stats: {
      "minecraft:custom": custom,
      "minecraft:killed": Object.fromEntries(mobs.map((m) => [`minecraft:${m}`, n])),
      "minecraft:mined": Object.fromEntries(blocks.map((b) => [`minecraft:${b}`, n])),
    },
    advancements: [],
  };
}

function setup() {
  const paid: { uuid: string; amount: number; reason: string }[] = [];
  const tasks = new DailyTasks(memoryRealm().db, "UTC", (uuid, amount, reason) => paid.push({ uuid, amount, reason }));
  return { tasks, paid };
}

const DAY1 = new Date("2026-12-01T10:00:00Z");
const at = (base: Date, h: number) => new Date(base.getTime() + h * 3_600_000);

describe("tareas diarias", () => {
  it("tres al día, una de cada dificultad, iguales para todos y estables", () => {
    const a = tasksForDay("2026-12-01");
    expect(a.map((t) => t.tier)).toEqual(["easy", "medium", "hard"]);
    expect(tasksForDay("2026-12-01").map((t) => t.id)).toEqual(a.map((t) => t.id));
    const days = Array.from({ length: 10 }, (_, i) => tasksForDay(`2026-12-${String(i + 1).padStart(2, "0")}`).map((t) => t.id).join());
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it("lo de antes de empezar el día no cuenta; cumplir paga una vez", () => {
    const { tasks, paid } = setup();
    expect(tasks.tick([player("a", 1000)], DAY1)).toEqual([]); // punto de partida
    const events = tasks.tick([player("a", 1600)], at(DAY1, 1)); // +600 de todo: cumple las tres
    expect(events.map((e) => e.task.tier)).toEqual(["easy", "medium", "hard"]);
    expect(events.map((e) => e.coins)).toEqual([TASK_REWARD.easy, TASK_REWARD.medium, TASK_REWARD.hard]);
    expect(events[2]?.streak).toEqual({ days: 1, bonus: streakBonus(1) });
    expect(tasks.tick([player("a", 2000)], at(DAY1, 2))).toEqual([]);
    expect(paid.reduce((n, p) => n + p.amount, 0)).toBe(15 + 30 + 50 + 10);
  });

  it("la racha sigue al día siguiente y se rompe si se salta uno", () => {
    const { tasks } = setup();
    const play = (day: Date, start: number) => {
      tasks.tick([player("a", start)], day);
      return tasks.tick([player("a", start + 600)], at(day, 1));
    };
    expect(play(DAY1, 0).at(-1)?.streak?.days).toBe(1);
    expect(play(at(DAY1, 24), 600).at(-1)?.streak?.days).toBe(2);
    expect(play(at(DAY1, 72), 1200).at(-1)?.streak?.days).toBe(1);
    expect(tasks.streakOf("a")).toMatchObject({ current: 1, best: 2 });
  });

  it("progreso para /tareas", () => {
    const { tasks } = setup();
    tasks.tick([player("a", 0)], DAY1);
    const progress = tasks.progressFor(player("a", 2), at(DAY1, 1));
    expect(progress).toHaveLength(3);
    expect(progress.every((p) => !p.done && p.progress >= 0)).toBe(true);
  });
});
