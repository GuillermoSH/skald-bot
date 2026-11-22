import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseAdvancementsFile,
  parseMinecraftDate,
  stat,
  topStat,
  WorldDataUnavailableError,
  WorldStats,
} from "../src/core/stats.js";
import { resolveWorldDir } from "../src/core/world.js";

const DATA = path.resolve("test/fixtures/data");
const RAGNAR = "11111111-1111-4111-8111-111111111111";
const FLOKI = "33333333-3333-4333-8333-333333333333";

describe("WorldStats", () => {
  it("lee todos los jugadores del mundo", async () => {
    const players = await new WorldStats(DATA).players();
    expect(players.map((p) => p.uuid).sort()).toHaveLength(4);
    const ragnar = players.find((p) => p.uuid === RAGNAR);
    expect(ragnar && stat(ragnar, "custom", "deaths")).toBe(12);
  });

  it("un jugador sin fichero de logros tiene la lista vacía", async () => {
    const floki = (await new WorldStats(DATA).players()).find((p) => p.uuid === FLOKI);
    expect(floki?.advancements).toEqual([]);
  });

  it("logros: sin recetas ni incompletos, del más reciente al más antiguo", async () => {
    const ragnar = (await new WorldStats(DATA).players()).find((p) => p.uuid === RAGNAR);
    expect(ragnar?.advancements.map((a) => a.id)).toEqual([
      "minecraft:nether/explore_nether",
      "minecraft:story/mine_stone",
      "minecraft:story/root",
    ]);
    // La fecha de un logro es la de su último criterio.
    expect(ragnar?.advancements[0]?.doneAt?.toISOString()).toBe("2026-09-09T11:42:48.000Z");
  });

  it("falla con un error claro si no existe la carpeta del mundo", async () => {
    await expect(new WorldStats("/no/existe").players()).rejects.toBeInstanceOf(WorldDataUnavailableError);
  });

  it("ignora un fichero corrupto sin tirar el resto", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "skald-"));
    const stats = path.join(dir, "world", "players", "stats");
    await mkdir(stats, { recursive: true });
    await writeFile(path.join(stats, `${RAGNAR}.json`), '{"stats": {"minecraft:custom": {"minecraft:deaths": 1}}}');
    await writeFile(path.join(stats, `${FLOKI}.json`), '{"stats": {"minecraft:cus'); // a medio escribir
    await writeFile(path.join(stats, "no-es-un-uuid.json"), "{}");
    const players = await new WorldStats(dir).players();
    expect(players.map((p) => p.uuid)).toEqual([RAGNAR]);
  });

  it("guarda en caché durante el TTL", async () => {
    const world = new WorldStats(DATA, 60_000);
    expect(await world.players()).toBe(await world.players());
  });
});

describe("topStat", () => {
  it("devuelve la clave con más valor", async () => {
    const ragnar = (await new WorldStats(DATA).players()).find((p) => p.uuid === RAGNAR);
    expect(ragnar && topStat(ragnar, "killed_by")).toEqual({ key: "minecraft:zombie", value: 4 });
    expect(ragnar && topStat(ragnar, "nada")).toBeNull();
  });
});

describe("parseMinecraftDate", () => {
  it("entiende el formato del juego, con zona horaria", () => {
    expect(parseMinecraftDate("2026-09-09 11:42:48 +0000")?.toISOString()).toBe("2026-09-09T11:42:48.000Z");
    expect(parseMinecraftDate("2026-08-05 21:00:00 +0200")?.toISOString()).toBe("2026-08-05T19:00:00.000Z");
    expect(parseMinecraftDate("ayer")).toBeNull();
  });
});

describe("parseAdvancementsFile", () => {
  it("tolera entradas raras", () => {
    expect(parseAdvancementsFile({ DataVersion: 1, "minecraft:x": "basura", "minecraft:y": { done: true } })).toEqual([
      { id: "minecraft:y", doneAt: null },
    ]);
  });
});

describe("resolveWorldDir", () => {
  it("usa level-name de server.properties", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "skald-"));
    await writeFile(path.join(dir, "server.properties"), "motd=x\nlevel-name=reino\n");
    expect(await resolveWorldDir(dir)).toBe(path.join(dir, "reino"));
  });

  it("ignora un level-name que se sale de DATA_DIR", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "skald-"));
    await writeFile(path.join(dir, "server.properties"), "level-name=../../etc\n");
    expect(await resolveWorldDir(dir)).toBe(path.join(dir, "world"));
  });

  it("sin server.properties usa «world»", async () => {
    expect(await resolveWorldDir("/no/existe")).toBe(path.join("/no/existe", "world"));
  });
});
