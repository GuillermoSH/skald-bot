import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DeathArchive, rankCauses, type DeathRecord } from "../src/core/deaths.js";
import { WorldDataUnavailableError } from "../src/core/stats.js";
import { FIXTURE_DATA, fixtureTranslator } from "./helpers.js";

const line = (msg: string) => `[12:00:00] [Server thread/INFO]: ${msg}`;

describe("DeathArchive", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "skald-deaths-"));
    await mkdir(path.join(dir, "logs"));
    await copyFile(path.join(FIXTURE_DATA, "logs", "latest.log"), path.join(dir, "logs", "latest.log"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("lee latest.log y los archivados .gz, y nada más", async () => {
    const old = [line("Lagertha was slain by Zombie"), line("Lagertha drowned"), line("Lagertha joined the game")].join("\n");
    await writeFile(path.join(dir, "logs", "2026-11-01-1.log.gz"), gzipSync(old));
    await writeFile(path.join(dir, "logs", "notas.txt"), line("Floki drowned"));
    const deaths = await new DeathArchive(dir, await fixtureTranslator()).all();
    expect(deaths.map((d) => d.player).sort()).toEqual(["Lagertha", "Lagertha", "Ragnar", "Ragnar"]);
    expect(deaths.find((d) => d.player === "Lagertha" && d.combat)).toMatchObject({ killer: "Zombie", key: "death.attack.mob" });
  });

  it("sin carpeta de logs, error de datos del mundo", async () => {
    await expect(new DeathArchive(path.join(dir, "nada"), await fixtureTranslator()).all()).rejects.toBeInstanceOf(
      WorldDataUnavailableError,
    );
  });
});

describe("rankCauses", () => {
  const d = (player: string, killer: string | null, key: string): DeathRecord => ({ player, killer, key, combat: killer !== null });
  const deaths = [
    d("Ragnar", "Creeper", "death.attack.explosion.player"),
    d("Floki", "creeper", "death.attack.explosion.player"),
    d("Floki", "Creeper", "death.attack.player"),
    d("Ragnar", null, "death.attack.drown"),
    d("Ragnar", null, "death.attack.drown"),
    d("Floki", null, "death.attack.lava"),
  ];

  it("agrupa por asesino en combate y por causa si no", () => {
    expect(rankCauses(deaths)).toEqual([
      { killer: "Creeper", key: null, count: 3 },
      { killer: null, key: "death.attack.drown", count: 2 },
      { killer: null, key: "death.attack.lava", count: 1 },
    ]);
  });

  it("filtra por guerrero sin distinguir mayúsculas", () => {
    expect(rankCauses(deaths, "ragnar").map((c) => c.count)).toEqual([2, 1]);
  });
});

describe("Translator.deathCause", () => {
  it("quita al jugador de la plantilla", async () => {
    const tr = await fixtureTranslator();
    expect(tr.deathCause("death.attack.drown")).toBe("Se ha ahogado");
    expect(tr.deathCause("death.no.existe")).toBeNull();
  });
});
