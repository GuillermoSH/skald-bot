import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readZipEntry } from "../src/core/zip.js";

const JAR = path.resolve("test/fixtures/data/versions/26.2/server-26.2.jar");

describe("readZipEntry", () => {
  it("extrae una entrada comprimida (deflate)", async () => {
    const data = await readZipEntry(JAR, "assets/minecraft/lang/en_us.json");
    const lang = JSON.parse(data?.toString("utf8") ?? "{}") as Record<string, string>;
    expect(lang["death.attack.explosion.player"]).toBe("%1$s was blown up by %2$s");
  });

  it("extrae una entrada sin comprimir", async () => {
    expect((await readZipEntry(JAR, "version.json"))?.toString()).toBe('{"id": "26.2"}');
  });

  it("devuelve null si la entrada no existe", async () => {
    expect(await readZipEntry(JAR, "no/existe.json")).toBeNull();
  });

  it("falla con un fichero que no es un zip", async () => {
    const file = path.join(await mkdtemp(path.join(tmpdir(), "skald-")), "falso.jar");
    await writeFile(file, "esto no es un zip");
    await expect(readZipEntry(file, "x")).rejects.toThrow(/no es un zip/);
  });
});
