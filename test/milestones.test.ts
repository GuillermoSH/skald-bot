import { describe, expect, it } from "vitest";
import { MILESTONES, MilestoneTracker, reachedThreshold } from "../src/core/milestones.js";
import type { PlayerRecord } from "../src/core/stats.js";
import { memoryRealm } from "./helpers.js";

const HOUR = 72_000;

function player(uuid: string, hours: number, deaths = 0, dragons = 0): PlayerRecord {
  return {
    uuid,
    stats: {
      "minecraft:custom": { "minecraft:play_time": hours * HOUR, "minecraft:deaths": deaths },
      "minecraft:killed": { "minecraft:ender_dragon": dragons },
    },
    advancements: [],
  };
}

describe("hitos", () => {
  it("cifra más alta superada", () => {
    expect(reachedThreshold(MILESTONES.play_time, 9.9)).toBe(0);
    expect(reachedThreshold(MILESTONES.play_time, 10)).toBe(10);
    expect(reachedThreshold(MILESTONES.play_time, 260)).toBe(250);
  });

  it("lo que ya tenía al empezar no se anuncia; lo nuevo sí, una vez", () => {
    const tracker = new MilestoneTracker(memoryRealm().db, 1);
    expect(tracker.check([player("a", 60, 12)])).toEqual([]);
    expect(tracker.check([player("a", 60, 12)])).toEqual([]);
    expect(tracker.check([player("a", 101, 12, 1)])).toEqual([
      { uuid: "a", id: "play_time", threshold: 100 },
      { uuid: "a", id: "dragon", threshold: 1 },
    ]);
    expect(tracker.check([player("a", 102, 12, 2)])).toEqual([]);
  });

  it("si salta varias cifras de golpe, solo la más alta", () => {
    const tracker = new MilestoneTracker(memoryRealm().db, 1);
    tracker.check([player("a", 1)]);
    expect(tracker.check([player("a", 300)])).toEqual([{ uuid: "a", id: "play_time", threshold: 250 }]);
  });

  it("un jugador nuevo empieza en silencio", () => {
    const tracker = new MilestoneTracker(memoryRealm().db, 1);
    tracker.check([player("a", 1)]);
    expect(tracker.check([player("a", 1), player("b", 20)])).toEqual([]);
    expect(tracker.check([player("b", 55)])).toEqual([{ uuid: "b", id: "play_time", threshold: 50 }]);
  });
});
