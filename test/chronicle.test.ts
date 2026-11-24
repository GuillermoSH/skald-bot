import { describe, expect, it } from "vitest";
import { Chronicle } from "../src/core/chronicle.js";

const at = new Date();

describe("Chronicle", () => {
  it("devuelve los más recientes primero, filtrando por tipo", () => {
    const c = new Chronicle(10);
    c.add({ type: "join", at, player: "Aaa" });
    c.add({ type: "advancement", at, player: "Aaa", kind: "task", title: "Uno", key: null });
    c.add({ type: "advancement", at, player: "Bbb", kind: "goal", title: "Dos", key: null });
    expect(c.recent(["advancement"], 5).map((e) => e.title)).toEqual(["Dos", "Uno"]);
  });

  it("no crece sin límite", () => {
    const c = new Chronicle(3);
    for (let i = 0; i < 10; i++) c.add({ type: "join", at, player: `P${i}xx` });
    expect(c.recent(["join"], 10).map((e) => e.player)).toEqual(["P9xx", "P8xx", "P7xx"]);
  });
});
