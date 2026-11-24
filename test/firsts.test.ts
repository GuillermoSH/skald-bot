import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emptyFirsts, FirstsLedger, firstsSchema } from "../src/core/firsts.js";
import { JsonStore } from "../src/core/state.js";
import { WorldStats, type PlayerRecord } from "../src/core/stats.js";
import { FIXTURE_DATA } from "./helpers.js";

const NETHER = "advancements.nether.explore_nether.title";
const at = (iso: string) => new Date(iso);

function player(uuid: string, advancements: [string, string][]): PlayerRecord {
  return { uuid, stats: {}, advancements: advancements.map(([id, when]) => ({ id, doneAt: at(when) })) };
}

describe("FirstsLedger", () => {
  it("no da primeros hasta haber leído el histórico", async () => {
    const ledger = await FirstsLedger.open(null);
    expect(ledger.claim(NETHER, "Ragnar", new Date())).toBe(false);
    await ledger.reconcile([]);
    expect(ledger.claim(NETHER, "Ragnar", new Date())).toBe(true);
    expect(ledger.claim(NETHER, "Lagertha", new Date())).toBe(false);
  });

  it("del histórico se queda con el más antiguo, en silencio", async () => {
    const ledger = await FirstsLedger.open(null);
    const added = await ledger.reconcile([
      player("b", [["minecraft:nether/explore_nether", "2026-09-10T00:00:00Z"]]),
      player("a", [["minecraft:nether/explore_nether", "2026-09-01T00:00:00Z"]]),
    ]);
    expect(added).toBe(1);
    expect(ledger.get(NETHER)).toMatchObject({ uuid: "a", live: false });
    expect(ledger.claim(NETHER, "Floki", new Date())).toBe(false);
    expect(await ledger.reconcile([player("c", [["minecraft:nether/explore_nether", "2020-01-01T00:00:00Z"]])])).toBe(0);
    expect(ledger.get(NETHER)?.uuid).toBe("a");
  });

  it("lee los ficheros del mundo de ejemplo", async () => {
    const ledger = await FirstsLedger.open(null);
    await ledger.reconcile(await new WorldStats(FIXTURE_DATA).players());
    expect(ledger.get(NETHER)).toBeDefined();
    expect(ledger.get("advancements.recipes.misc.stick.title")).toBeUndefined();
  });

  it("recuerda entre reinicios", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "skald-firsts-"));
    try {
      const store = () => new JsonStore(path.join(dir, "firsts.json"), firstsSchema, emptyFirsts);
      const first = await FirstsLedger.open(store());
      await first.reconcile([]);
      expect(first.claim(NETHER, "Ragnar", at("2026-11-24T20:00:00Z"))).toBe(true);
      await first.flush();
      const again = await FirstsLedger.open(store());
      expect(again.seeded).toBe(true);
      expect(again.get(NETHER)).toMatchObject({ player: "Ragnar", live: true, at: "2026-11-24T20:00:00.000Z" });
      expect(again.claim(NETHER, "Lagertha", new Date())).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
