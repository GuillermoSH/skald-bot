import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorldStats } from "../src/core/stats.js";
import { Realm, type FinalRanking } from "../src/realm.js";
import { FIXTURE_DATA } from "./helpers.js";

const NETHER = "advancements.nether.explore_nether.title";

describe("Realm", () => {
  let root: string;
  let data: string;
  let realm: Realm;

  const setLevel = (name: string) => writeFile(path.join(data, "server.properties"), `level-name=${name}\n`);

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "skald-realm-"));
    data = path.join(root, "data");
    await cp(FIXTURE_DATA, data, { recursive: true });
    await setLevel("world");
    realm = new Realm(
      { dataDir: data, stateDir: path.join(root, "state"), timeZone: "UTC", economy: true, firstSeasonName: "Era I" },
      new WorldStats(data, 0),
    );
    await realm.init();
  });
  afterEach(async () => {
    realm.close();
    await rm(root, { recursive: true, force: true });
  });

  it("abre la primera era y lee el histórico", async () => {
    expect(realm.season?.name).toBe("Era I");
    expect(await realm.reconcileFirsts()).toBeGreaterThan(0);
    expect(realm.claimFirst(NETHER, "Floki", new Date())).toBe(false);
    expect(realm.claimFirst("advancements.end.kill_dragon.title", "Floki", new Date())).toBe(true);
  });

  it("con otro mundo se pone en pausa, avisa una vez y espera al admin", async () => {
    await realm.reconcileFirsts();
    await setLevel("yule");
    expect(await realm.checkSeason()).toBe("yule");
    expect(await realm.checkSeason()).toBeNull();
    expect(realm.pendingLevelName).toBe("yule");
    expect(realm.claimFirst("advancements.end.kill_dragon.title", "Floki", new Date())).toBe(false);
    expect(await realm.tick()).toEqual({ milestones: [], earnings: [] });
    // El saldo se sigue pudiendo consultar.
    expect(realm.economy?.balance("x")).toBe(0);

    // El mundo nuevo aún no existe en disco: la era se abre igual, con ranking de la anterior.
    const { closed, opened } = await realm.openSeason("Yule");
    expect(closed?.name).toBe("Era I");
    expect(opened).toMatchObject({ name: "Yule", levelName: "yule" });
    const ranking = JSON.parse(realm.seasons?.byId(closed?.id ?? 0)?.finalRanking ?? "{}") as FinalRanking;
    expect(ranking.play_time?.[0]?.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(realm.pendingLevelName).toBeNull();
    expect(await realm.checkSeason()).toBeNull();
  });
});
