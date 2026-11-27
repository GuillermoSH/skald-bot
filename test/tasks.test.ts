import { describe, expect, it } from "vitest";
import { Economy } from "../src/core/economy.js";
import type { PlayerRecord } from "../src/core/stats.js";
import { DailyTasks, REROLL_COST, streakBonus, TASK_REWARD, TASKS, WEEKLY_REWARD, WeeklyMission, weekOf } from "../src/core/tasks.js";
import { memoryRealm } from "./helpers.js";

const NETHER = "minecraft:story/enter_the_nether";

/** Jugador con todas las estadísticas que usan las misiones a `n`. */
function player(uuid: string, n: number, opts: { nether?: boolean; savedAt?: Date } = {}): PlayerRecord {
  const mobs = ["zombie", "skeleton", "creeper", "enderman", "spider", "zombified_piglin", "blaze", "wither_skeleton", "shulker"];
  const blocks = ["stone", "oak_log", "iron_ore", "diamond_ore", "nether_quartz_ore", "ancient_debris", "end_stone"];
  return {
    uuid,
    stats: {
      "minecraft:custom": {
        "minecraft:mob_kills": n,
        "minecraft:fish_caught": n,
        "minecraft:animals_bred": n,
        "minecraft:traded_with_villager": n,
        "minecraft:walk_one_cm": n * 100_000,
      },
      "minecraft:killed": Object.fromEntries(mobs.map((m) => [`minecraft:${m}`, n])),
      "minecraft:mined": Object.fromEntries(blocks.map((b) => [`minecraft:${b}`, n])),
    },
    advancements: opts.nether ? [{ id: NETHER, doneAt: new Date() }] : [],
    savedAt: opts.savedAt ?? new Date(),
  };
}

const DAY1 = new Date("2026-12-01T10:00:00Z");
const at = (base: Date, h: number) => new Date(base.getTime() + h * 3_600_000);

/** Un rng que va dando los valores de la lista (y luego 0). */
const seq = (...values: number[]) => (max: number) => (values.shift() ?? 0) % max;

function setup(rng = seq()) {
  const { db, seasonId } = memoryRealm();
  const economy = new Economy(db, seasonId, "UTC");
  return { economy, tasks: new DailyTasks(db, "UTC", economy, rng), weekly: new WeeklyMission(db, "UTC", economy, seq()) };
}

describe("misiones diarias individuales", () => {
  it("tres por jugador (una de cada dificultad), guardadas para el día", () => {
    const { tasks } = setup(seq(1, 2, 3, 0, 0, 0));
    const a = tasks.progressFor(player("a", 0), DAY1);
    expect(a.map((p) => p.task.tier)).toEqual(["easy", "medium", "hard"]);
    const b = tasks.progressFor(player("b", 0), DAY1);
    expect(b.map((p) => p.task.id)).not.toEqual(a.map((p) => p.task.id));
    expect(tasks.progressFor(player("a", 5), at(DAY1, 2)).map((p) => p.task.id)).toEqual(a.map((p) => p.task.id));
  });

  it("las del Nether solo a quien ha entrado en el Nether", () => {
    const netherIds = new Set(TASKS.filter((t) => t.requires === "nether").map((t) => t.id));
    for (let i = 0; i < 20; i++) {
      const { tasks } = setup(seq(i, i, i));
      expect(tasks.progressFor(player("a", 0), DAY1).some((p) => netherIds.has(p.task.id))).toBe(false);
    }
  });

  it("cumplir paga una vez, y las tres suman racha", () => {
    const { tasks, economy } = setup();
    tasks.tick([player("a", 1000)], DAY1);
    const events = tasks.tick([player("a", 3000)], at(DAY1, 1));
    expect(events.map((e) => e.coins)).toEqual([TASK_REWARD.easy, TASK_REWARD.medium, TASK_REWARD.hard]);
    expect(events[2]?.streak).toEqual({ days: 1, bonus: streakBonus(1) });
    expect(tasks.tick([player("a", 4000)], at(DAY1, 2))).toEqual([]);
    expect(economy.balance("a")).toBe(15 + 30 + 50 + 10);
  });

  it("la racha sigue al día siguiente y se rompe si se salta uno", () => {
    const { tasks } = setup();
    const play = (day: Date, start: number) => {
      tasks.tick([player("a", start)], day);
      return tasks.tick([player("a", start + 3000)], at(day, 1));
    };
    expect(play(DAY1, 0).at(-1)?.streak?.days).toBe(1);
    expect(play(at(DAY1, 24), 3000).at(-1)?.streak?.days).toBe(2);
    expect(play(at(DAY1, 72), 6000).at(-1)?.streak?.days).toBe(1);
    expect(tasks.streakOf("a")).toMatchObject({ current: 1, best: 2 });
  });

  it("cambiar una misión: 20 monedas, una vez al día, no las cumplidas", () => {
    const { tasks, economy } = setup();
    const p = player("a", 0);
    expect(tasks.reroll(p, 1, DAY1)).toEqual({ ok: false, reason: "poor" });
    economy.credit("a", 50, "test", "2026-12-01");
    const before = tasks.progressFor(p, DAY1)[0]?.task.id;
    const r = tasks.reroll(p, 1, DAY1);
    expect(r.ok).toBe(true);
    expect(tasks.progressFor(p, DAY1)[0]?.task.id).not.toBe(before);
    expect(economy.balance("a")).toBe(50 - REROLL_COST);
    expect(tasks.reroll(p, 2, DAY1)).toEqual({ ok: false, reason: "used" });
    expect(tasks.reroll(p, 4, at(DAY1, 24))).toEqual({ ok: false, reason: "bad_slot" });
  });
});

describe("misión semanal del reino", () => {
  it("suma lo de todos y paga lo mismo a cada uno que aportó (una vez)", () => {
    const { weekly, economy } = setup();
    const t0 = new Date("2026-11-30T10:00:00Z"); // lunes
    weekly.tick([player("a", 0), player("b", 0), player("c", 0)], t0);
    const target = weekly.status([player("a", 0)], t0).mission.target;
    const half = Math.ceil(target / 2);
    expect(weekly.tick([player("a", half), player("b", 0), player("c", 0)], at(t0, 1))).toBeNull();
    const done = weekly.tick([player("a", half), player("b", half), player("c", 0)], at(t0, 2));
    expect(done?.contributors.sort()).toEqual(["a", "b"]);
    expect(economy.balance("a")).toBe(WEEKLY_REWARD);
    expect(economy.balance("c")).toBe(0);
    expect(weekly.tick([player("a", target * 3), player("b", half)], at(t0, 3))).toBeNull();
  });

  it("la semana va de lunes a domingo", () => {
    expect(weekOf("2026-12-06")).toBe("2026-11-30"); // domingo
    expect(weekOf("2026-11-30")).toBe("2026-11-30"); // lunes
  });
});
