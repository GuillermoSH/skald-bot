import { describe, expect, it } from "vitest";
import { FirstsLedger } from "../src/core/firsts.js";
import { WorldStats, type PlayerRecord } from "../src/core/stats.js";
import { FIXTURE_DATA, memoryRealm } from "./helpers.js";

const NETHER = "advancements.nether.explore_nether.title";
const at = (iso: string) => new Date(iso);

function player(uuid: string, advancements: [string, string][]): PlayerRecord {
  return { uuid, stats: {}, advancements: advancements.map(([id, when]) => ({ id, doneAt: at(when) })) };
}

function ledger() {
  const { db, seasons, seasonId } = memoryRealm();
  return { db, seasons, seasonId, ledger: new FirstsLedger(db, seasons, seasonId) };
}

describe("FirstsLedger", () => {
  it("no da primeros hasta haber leído el histórico", () => {
    const { ledger: l } = ledger();
    expect(l.claim(NETHER, "Ragnar", new Date())).toBe(false);
    l.reconcile([]);
    expect(l.claim(NETHER, "Ragnar", new Date())).toBe(true);
    expect(l.claim(NETHER, "Lagertha", new Date())).toBe(false);
  });

  it("del histórico se queda con el más antiguo, en silencio", () => {
    const { ledger: l } = ledger();
    const added = l.reconcile([
      player("b", [["minecraft:nether/explore_nether", "2026-09-10T00:00:00Z"]]),
      player("a", [["minecraft:nether/explore_nether", "2026-09-01T00:00:00Z"]]),
    ]);
    expect(added).toBe(1);
    expect(l.get(NETHER)).toMatchObject({ uuid: "a", live: false });
    expect(l.claim(NETHER, "Floki", new Date())).toBe(false);
    expect(l.reconcile([player("c", [["minecraft:nether/explore_nether", "2020-01-01T00:00:00Z"]])])).toBe(0);
    expect(l.get(NETHER)?.uuid).toBe("a");
  });

  it("lee los ficheros del mundo de ejemplo", async () => {
    const { ledger: l } = ledger();
    l.reconcile(await new WorldStats(FIXTURE_DATA).players());
    expect(l.get(NETHER)).toBeDefined();
    expect(l.get("advancements.recipes.misc.stick.title")).toBeUndefined();
  });

  it("recuerda entre reinicios (y por temporada)", () => {
    const { db, seasons, seasonId, ledger: first } = ledger();
    first.reconcile([]);
    expect(first.claim(NETHER, "Ragnar", at("2026-11-24T20:00:00Z"))).toBe(true);
    const again = new FirstsLedger(db, seasons, seasonId);
    expect(again.seeded).toBe(true);
    expect(again.get(NETHER)).toMatchObject({ player: "Ragnar", live: true, at: "2026-11-24T20:00:00.000Z" });
    expect(again.claim(NETHER, "Lagertha", new Date())).toBe(false);

    // Temporada nueva: todo por estrenar (pero hay que leer su histórico primero).
    const next = new FirstsLedger(db, seasons, seasons.open("Era II", "world2", null).id);
    expect(next.claim(NETHER, "Lagertha", new Date())).toBe(false);
    next.reconcile([]);
    expect(next.claim(NETHER, "Lagertha", new Date())).toBe(true);
  });
});

describe("primeros de cada uno", () => {
  it("cuenta los del histórico (UUID) y los del log (nombre)", () => {
    const { db, seasons, seasonId } = memoryRealm();
    const l = new FirstsLedger(db, seasons, seasonId);
    l.reconcile([player("u-ragnar", [["minecraft:story/mine_stone", "2026-09-01T00:00:00Z"]])]);
    l.claim(NETHER, "Ragnar", new Date());
    l.claim("advancements.end.kill_dragon.title", "Floki", new Date());
    expect(l.countFor("u-ragnar", "ragnar")).toBe(2);
    expect(l.countFor("u-floki", "Floki")).toBe(1);
    expect(l.countFor("u-ivar", "Ivar")).toBe(0);
  });
});
