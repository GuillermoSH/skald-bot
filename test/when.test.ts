import { describe, expect, it } from "vitest";
import { parseWhen, zonedToUtc } from "../src/core/when.js";

// Martes 25/11/2026 a las 18:00 en Madrid (UTC+1).
const NOW = new Date("2026-11-25T17:00:00Z");
const TZ = "Europe/Madrid";
const at = (s: string) => parseWhen(s, NOW, TZ)?.toISOString() ?? null;

describe("parseWhen", () => {
  it("relativas", () => {
    expect(at("30m")).toBe("2026-11-25T17:30:00.000Z");
    expect(at("2h")).toBe("2026-11-25T19:00:00.000Z");
    expect(at("1h 30m")).toBe("2026-11-25T18:30:00.000Z");
    expect(at("en 3 días")).toBe("2026-11-28T17:00:00.000Z");
    expect(at("90 min")).toBe("2026-11-25T18:30:00.000Z");
    expect(at("2 horas")).toBe("2026-11-25T19:00:00.000Z");
  });

  it("horas: hoy si no ha pasado, si no mañana", () => {
    expect(at("21:30")).toBe("2026-11-25T20:30:00.000Z");
    expect(at("09:00")).toBe("2026-11-26T08:00:00.000Z");
    expect(at("mañana 18:00")).toBe("2026-11-26T17:00:00.000Z");
    expect(at("mañana 18")).toBe("2026-11-26T17:00:00.000Z");
    expect(at("a las 22.15")).toBe("2026-11-25T21:15:00.000Z");
  });

  it("fechas: este año, o el siguiente si ya pasó", () => {
    expect(at("24/12 21:30")).toBe("2026-12-24T20:30:00.000Z");
    expect(at("01/03 10:00")).toBe("2027-03-01T09:00:00.000Z");
    expect(at("01/07/2027 10:00")).toBe("2027-07-01T08:00:00.000Z"); // verano: UTC+2
  });

  it("lo que no se entiende o no existe", () => {
    for (const bad of ["", "pronto", "18", "31/02 10:00", "25:00", "0m", "3 semanas"]) expect(at(bad)).toBeNull();
  });

  it("zonedToUtc en otras zonas", () => {
    expect(zonedToUtc({ year: 2026, month: 12, day: 24, hour: 21, minute: 0 }, "Atlantic/Canary")?.toISOString()).toBe(
      "2026-12-24T21:00:00.000Z",
    );
  });
});
