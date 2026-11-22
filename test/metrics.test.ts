import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { isLogBlock, METRIC_IDS, METRICS, rank } from "../src/core/metrics.js";
import { WorldStats, type PlayerRecord } from "../src/core/stats.js";
import { texts } from "../src/util/texts.js";

const RAGNAR = "11111111-1111-4111-8111-111111111111";
const LAGERTHA = "22222222-2222-4222-8222-222222222222";
const FLOKI = "33333333-3333-4333-8333-333333333333";
const IVAR = "44444444-4444-4444-8444-444444444444";

let players: PlayerRecord[];
const get = (uuid: string) => {
  const p = players.find((x) => x.uuid === uuid);
  if (!p) throw new Error(uuid);
  return p;
};

beforeAll(async () => {
  players = await new WorldStats(path.resolve("test/fixtures/data")).players();
});

describe("métricas", () => {
  it("muertes tontas = muertes que no son de un mob", () => {
    expect(METRICS.silly_deaths.value(get(RAGNAR))).toBe(3); // 12 - (3 + 4 + 2)
    expect(METRICS.silly_deaths.value(get(LAGERTHA))).toBe(0);
    expect(METRICS.silly_deaths.value(get(FLOKI))).toBe(7); // sin killed_by: todas tontas
  });

  it("distancia: suma todo menos las caídas", () => {
    expect(METRICS.distance.value(get(RAGNAR))).toBe(1500000 + 900000 + 250000 + 30000 + 10000);
  });

  it("leñador: troncos, madera e hifas; no tallos de calabaza/melón/champiñón", () => {
    expect(METRICS.logs.value(get(LAGERTHA))).toBe(500 + 20 + 40);
    expect(METRICS.logs.value(get(RAGNAR))).toBe(300);
    expect(isLogBlock("minecraft:warped_stem")).toBe(true);
    expect(isLogBlock("minecraft:stripped_crimson_stem")).toBe(true);
    expect(isLogBlock("minecraft:pumpkin_stem")).toBe(false);
    expect(isLogBlock("minecraft:big_dripleaf_stem")).toBe(false);
  });

  it("diamantes: mena normal y de pizarra profunda", () => {
    expect(METRICS.diamonds.value(get(RAGNAR))).toBe(10);
  });

  it("logros: cuenta los completados", () => {
    expect(METRICS.advancements.value(get(LAGERTHA))).toBe(4);
    expect(METRICS.advancements.value(get(FLOKI))).toBe(0);
  });

  it("todas las métricas tienen texto, y caben en las opciones de Discord", () => {
    expect(METRIC_IDS.length).toBeLessThanOrEqual(25);
    for (const id of METRIC_IDS) {
      const c = texts.gestas.categories[id];
      expect(`${c.emoji} ${c.label}`.length).toBeLessThanOrEqual(100);
    }
  });
});

describe("rank", () => {
  it("ordena de mayor a menor", () => {
    expect(rank(players, "play_time").map((e) => e.uuid)).toEqual([LAGERTHA, RAGNAR, IVAR, FLOKI]);
  });

  it("deja fuera a quien tiene 0", () => {
    expect(rank(players, "fish")).toEqual([{ uuid: LAGERTHA, value: 12 }]);
    expect(rank(players, "deaths").map((e) => e.uuid)).not.toContain(IVAR);
  });

  it("respeta el límite", () => {
    expect(rank(players, "jumps", 2)).toHaveLength(2);
  });

  it("rankings divertidos", () => {
    expect(rank(players, "eggs")[0]?.uuid).toBe(FLOKI);
    expect(rank(players, "chickens")[0]?.uuid).toBe(IVAR);
    expect(rank(players, "bells")[0]?.uuid).toBe(FLOKI);
    expect(rank(players, "survivor")[0]?.uuid).toBe(LAGERTHA);
  });
});
