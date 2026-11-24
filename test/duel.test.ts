import { describe, expect, it } from "vitest";
import { duel } from "../src/core/duel.js";
import type { PlayerRecord } from "../src/core/stats.js";

function player(uuid: string, custom: Record<string, number>): PlayerRecord {
  return {
    uuid,
    stats: { "minecraft:custom": Object.fromEntries(Object.entries(custom).map(([k, v]) => [`minecraft:${k}`, v])) },
    advancements: [],
  };
}

describe("duel", () => {
  const cats = [{ id: "play_time" as const }, { id: "mob_kills" as const }, { id: "deaths" as const, lowerWins: true }];

  it("gana quien más tiene, salvo en las muertes", () => {
    const a = player("a", { play_time: 100, mob_kills: 5, deaths: 9 });
    const b = player("b", { play_time: 50, mob_kills: 7, deaths: 2 });
    const r = duel(a, b, cats);
    expect(r.rounds.map((x) => x.winner)).toEqual(["a", "b", "b"]);
    expect(r.score).toEqual({ a: 1, b: 2 });
    expect(r.winner).toBe("b");
  });

  it("empates por categoría y en el total", () => {
    const a = player("a", { play_time: 10, mob_kills: 3 });
    const b = player("b", { play_time: 10, mob_kills: 3 });
    const r = duel(a, b, cats);
    expect(r.rounds.every((x) => x.winner === null)).toBe(true);
    expect(r.winner).toBeNull();
  });

  it("con las categorías por defecto no revienta con jugadores vacíos", () => {
    const r = duel(player("a", {}), player("b", {}));
    expect(r.rounds.length).toBeGreaterThan(10);
    expect(r.winner).toBeNull();
  });
});
