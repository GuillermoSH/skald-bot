import { describe, expect, it } from "vitest";
import { formatBytes, formatCount, formatDistance, formatDuration } from "../src/util/format.js";

describe("formato", () => {
  it("duraciones en ticks", () => {
    expect(formatDuration(1200 * 12)).toBe("12 min");
    expect(formatDuration(72000 * 5 + 1200 * 20)).toBe("5 h 20 min");
    expect(formatDuration(72000 * 24 * 3 + 72000 * 4)).toBe("3 d 4 h");
  });

  it("distancias en centímetros", () => {
    expect(formatDistance(85_000)).toBe("850 m");
    expect(formatDistance(4_530_000)).toBe("45,3 km");
  });

  it("números con separador español", () => {
    expect(formatCount(1234567)).toBe("1.234.567");
  });
});


describe("formatBytes", () => {
  it("unidades decimales con formato español", () => {
    expect(formatBytes(870_074_187)).toBe("870,1 MB");
    expect(formatBytes(4_900_000_000)).toBe("4,9 GB");
    expect(formatBytes(512)).toBe("512 B");
  });
});
