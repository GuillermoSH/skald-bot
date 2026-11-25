import { describe, expect, it } from "vitest";
import { dayIn, Economy } from "../src/core/economy.js";
import type { PlayerRecord } from "../src/core/stats.js";
import { memoryRealm } from "./helpers.js";

const MIN = 1200; // ticks

function p(uuid: string, s: { minutes?: number; kills?: number; mined?: number; km?: number }): PlayerRecord {
  return {
    uuid,
    stats: {
      "minecraft:custom": {
        "minecraft:play_time": (s.minutes ?? 0) * MIN,
        "minecraft:mob_kills": s.kills ?? 0,
        "minecraft:walk_one_cm": (s.km ?? 0) * 100_000,
      },
      "minecraft:mined": { "minecraft:stone": s.mined ?? 0 },
    },
    advancements: [],
  };
}

const T0 = new Date("2026-11-25T10:00:00Z");
const later = (min: number) => new Date(T0.getTime() + min * 60_000);

function economy() {
  const { db, seasonId } = memoryRealm();
  return new Economy(db, seasonId, "UTC");
}

describe("Economy", () => {
  it("la primera vez solo apunta la línea base (lo de antes no se paga)", () => {
    const e = economy();
    expect(e.tick([p("a", { minutes: 6000, kills: 900 })], T0)).toEqual([]);
    expect(e.balance("a")).toBe(0);
  });

  it("paga por lo nuevo y guarda lo que no llega a una moneda", () => {
    const e = economy();
    e.tick([p("a", { minutes: 0, kills: 0 })], T0);
    expect(e.tick([p("a", { minutes: 25, kills: 7 })], later(5))).toEqual([
      { uuid: "a", category: "play_time", amount: 2 },
      { uuid: "a", category: "mob_kills", amount: 1 },
    ]);
    // 5 min y 2 enemigos sobraban: con 5 min y 3 más llegan a otra moneda cada uno.
    expect(e.tick([p("a", { minutes: 30, kills: 10 })], later(10)).map((x) => x.amount)).toEqual([1, 1]);
    expect(e.balance("a")).toBe(5);
  });

  it("el tiempo quieto (AFK) no cuenta", () => {
    const e = economy();
    e.tick([p("a", { minutes: 0 })], T0);
    expect(e.tick([p("a", { minutes: 60 })], later(60))).toEqual([]);
    // Y no se acumula para cuando se mueva.
    expect(e.tick([p("a", { minutes: 70, km: 1 })], later(70))).toEqual([
      { uuid: "a", category: "play_time", amount: 1 },
      { uuid: "a", category: "distance", amount: 1 },
    ]);
  });

  it("tope diario: lo que sobra se pierde; al día siguiente vuelve a contar", () => {
    const e = economy();
    e.tick([p("a", { mined: 0 })], T0);
    expect(e.tick([p("a", { mined: 5000 })], later(5))).toEqual([{ uuid: "a", category: "blocks_mined", amount: 40 }]);
    expect(e.tick([p("a", { mined: 5100 })], later(10))).toEqual([]);
    expect(e.earnedToday("a", later(10)).blocks_mined).toBe(40);
    const tomorrow = new Date("2026-11-26T09:00:00Z");
    expect(e.tick([p("a", { mined: 5200 })], tomorrow)).toEqual([{ uuid: "a", category: "blocks_mined", amount: 2 }]);
  });

  it("si una estadística baja, se vuelve a empezar desde ahí", () => {
    const e = economy();
    e.tick([p("a", { kills: 100 })], T0);
    expect(e.tick([p("a", { kills: 3 })], later(5))).toEqual([]);
    expect(e.tick([p("a", { kills: 8 })], later(10))).toEqual([{ uuid: "a", category: "mob_kills", amount: 1 }]);
  });

  it("ranking por saldo", () => {
    const e = economy();
    e.tick([p("a", {}), p("b", {})], T0);
    e.tick([p("a", { kills: 50 }), p("b", { kills: 10 })], later(5));
    expect(e.top()).toEqual([
      { uuid: "a", balance: 10 },
      { uuid: "b", balance: 2 },
    ]);
  });

  it("el día va por la zona horaria", () => {
    const at = new Date("2026-11-25T23:30:00Z");
    expect(dayIn("UTC", at)).toBe("2026-11-25");
    expect(dayIn("Europe/Madrid", at)).toBe("2026-11-26");
  });
});
