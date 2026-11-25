import { describe, expect, it } from "vitest";
import type { TickInfo } from "../src/core/parsers.js";
import { buildPanel, panelState, type PanelSnapshot } from "../src/panel.js";

const tick = (averageMs: number, state: TickInfo["state"] = "normal"): TickInfo =>
  ({ state, targetRate: 20, averageMs, targetMs: 50 }) as TickInfo;

const snap = (over: Partial<PanelSnapshot>): PanelSnapshot => ({
  online: true,
  playersOnline: 2,
  playersMax: 20,
  names: ["Ragnar", "Lagertha"],
  version: "26.2",
  tick: tick(3.4),
  era: "Era I",
  pendingLevel: null,
  backup: { at: new Date("2026-11-25T04:31:00Z"), status: "ok" },
  ...over,
});

describe("panel del reino", () => {
  it("estado según el servidor", () => {
    expect(panelState(snap({}))).toBe("ok");
    expect(panelState(snap({ playersOnline: 0, names: [] }))).toBe("empty");
    expect(panelState(snap({ tick: tick(80) }))).toBe("lag");
    expect(panelState(snap({ tick: tick(10, "lagging") }))).toBe("lag");
    expect(panelState(snap({ online: false }))).toBe("down");
  });

  it("contenido: guerreros ordenados, TPS al milisegundo, era y copia", () => {
    const { embed } = buildPanel(snap({ pendingLevel: "yule" }));
    const json = embed.toJSON();
    const field = (prefix: string) => json.fields?.find((f) => f.name.startsWith(prefix))?.value;
    expect(field("⚔️")).toBe("Lagertha, Ragnar");
    expect(field("⚙️")).toBe("3 ms");
    expect(field("🌍")).toContain("yule");
    expect(field("💾")).toMatch(/^<t:\d+:R>$/);
    expect(json.footer?.text).toContain("estado del reino");
  });

  it("caído: sin datos del servidor", () => {
    const json = buildPanel(snap({ online: false })).embed.toJSON();
    expect(json.fields?.some((f) => f.name.startsWith("⚔️"))).toBe(false);
    expect(json.description).toContain("duerme");
  });

  it("nombres con formato de Discord, escapados", () => {
    const json = buildPanel(snap({ names: ["__Ivar__"] })).embed.toJSON();
    expect(json.fields?.[0]?.value).not.toBe("__Ivar__");
  });
});
