import { describe, expect, it } from "vitest";
import { Reminders } from "../src/core/reminders.js";
import { memoryRealm } from "./helpers.js";

const T0 = new Date("2026-11-25T17:00:00Z");
const base = { guildId: "g", channelId: "c", userId: "u", text: "hola", eventId: null } as const;

describe("Reminders", () => {
  it("vencidos en orden; hecho = no vuelve a salir", () => {
    const r = new Reminders(memoryRealm().db);
    const late = r.add({ ...base, kind: "user", dueAt: new Date("2026-11-25T17:10:00Z") }, T0);
    const early = r.add({ ...base, kind: "channel", dueAt: new Date("2026-11-25T17:05:00Z") }, T0);
    r.add({ ...base, kind: "user", dueAt: new Date("2026-11-26T00:00:00Z") }, T0);
    expect(r.due(new Date("2026-11-25T17:20:00Z")).map((x) => x.id)).toEqual([early, late]);
    r.done(early);
    expect(r.due(new Date("2026-11-25T17:20:00Z")).map((x) => x.id)).toEqual([late]);
  });

  it("cada uno ve y borra solo los suyos (y no los de quedadas)", () => {
    const r = new Reminders(memoryRealm().db);
    const mine = r.add({ ...base, kind: "user", dueAt: T0 }, T0);
    r.add({ ...base, userId: "otro", kind: "user", dueAt: T0 }, T0);
    const ev = r.add({ ...base, kind: "event", eventId: "e", dueAt: T0 }, T0);
    expect(r.pendingFor("u").map((x) => x.id)).toEqual([mine]);
    expect(r.cancel(mine, "otro")).toBe(false);
    expect(r.cancel(ev, "u")).toBe(false);
    expect(r.cancel(mine, "u")).toBe(true);
    expect(r.pendingFor("u")).toEqual([]);
  });
});
