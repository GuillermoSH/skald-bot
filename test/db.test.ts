import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupDatabase, Database, MIGRATIONS, openStateDatabase } from "../src/core/db.js";
import { migrateLegacyState } from "../src/core/legacy-state.js";
import { Seasons } from "../src/core/seasons.js";

describe("Database", () => {
  it("aplica las migraciones una vez", () => {
    const db = new Database(":memory:");
    expect(db.migrate()).toBe(MIGRATIONS.length);
    expect(db.migrate()).toBe(0);
    expect(db.version).toBe(MIGRATIONS.length);
  });

  it("no abre una base de datos de un Skald más nuevo", () => {
    const db = new Database(":memory:");
    db.migrate();
    expect(() => db.migrate(MIGRATIONS.slice(0, 1))).toThrow(/más nueva/);
  });

  it("una migración que falla no deja nada a medias", () => {
    const db = new Database(":memory:");
    expect(() => db.migrate(["CREATE TABLE a (x); CREATE TABLE roto ("])).toThrow();
    expect(db.version).toBe(0);
    expect(db.get("SELECT name FROM sqlite_master WHERE name = 'a'")).toBeUndefined();
  });

  it("meta", () => {
    const db = new Database(":memory:");
    db.migrate();
    db.setMeta("k", "1");
    db.setMeta("k", "2");
    expect(db.getMeta("k")).toBe("2");
    db.setMeta("k", null);
    expect(db.getMeta("k")).toBeNull();
  });
});

describe("en disco", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "skald-db-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("copia diaria con pocas guardadas", async () => {
    const db = await openStateDatabase(dir);
    const backups = path.join(dir, "backups");
    for (let d = 1; d <= 9; d++) await backupDatabase(db, backups, 7, new Date(`2026-11-0${d}T12:00:00Z`));
    expect(await backupDatabase(db, backups, 7, new Date("2026-11-09T20:00:00Z"))).toBeNull();
    const files = await readdir(backups);
    expect(files).toHaveLength(7);
    expect(files[0]).toBe("skald-20261103.db");
    const copy = new Database(path.join(backups, "skald-20261109.db"));
    expect(copy.version).toBe(MIGRATIONS.length);
    copy.close();
    db.close();
  });

  it("pasa los JSON antiguos a la temporada y los aparta", async () => {
    await writeFile(
      path.join(dir, "firsts.json"),
      JSON.stringify({
        version: 1,
        seeded: true,
        claims: { "advancements.story.mine_stone.title": { player: null, uuid: "u1", at: "2026-08-01T10:05:00.000Z", live: false } },
      }),
    );
    await writeFile(path.join(dir, "milestones.json"), JSON.stringify({ version: 1, reached: { u1: { play_time: 10 } } }));
    const db = await openStateDatabase(dir);
    const seasons = new Seasons(db);
    const season = seasons.open("Era I", "world", null);
    expect(await migrateLegacyState(db, seasons, dir, season.id)).toBe(3);
    expect(seasons.byId(season.id)?.firstsSeeded).toBe(true);
    expect(db.get("SELECT threshold FROM milestones WHERE uuid = 'u1' AND milestone_id = 'play_time'")).toEqual({ threshold: 10 });
    expect((await readdir(dir)).filter((f) => f.endsWith(".migrated")).sort()).toEqual(["firsts.json.migrated", "milestones.json.migrated"]);
    expect(await migrateLegacyState(db, seasons, dir, season.id)).toBe(0);
    db.close();
  });
});

describe("Seasons", () => {
  const fresh = () => {
    const db = new Database(":memory:");
    db.migrate();
    return new Seasons(db);
  };

  it("abre la primera sola y detecta el cambio de mundo sin cambiar nada", () => {
    const s = fresh();
    expect(s.detect("world", "Era I").status).toBe("created");
    expect(s.detect("world", "Era I").status).toBe("ok");
    const check = s.detect("yule", "Era I");
    expect(check).toMatchObject({ status: "mismatch", levelName: "yule" });
    expect(s.current()?.levelName).toBe("world");
    expect(s.count).toBe(1);
  });

  it("abrir cierra la anterior con su ranking", () => {
    const s = fresh();
    s.detect("world", "Era I");
    const next = s.open("Yule", "yule", { play_time: [{ uuid: "u", value: 1 }] });
    expect(s.current()?.id).toBe(next.id);
    const [, old] = s.list();
    expect(old?.endedAt).not.toBeNull();
    expect(JSON.parse(old?.finalRanking ?? "null")).toEqual({ play_time: [{ uuid: "u", value: 1 }] });
  });
});
