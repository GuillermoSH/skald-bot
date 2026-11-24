import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { JsonStore } from "../src/core/state.js";

const schema = z.object({ n: z.number() });

describe("JsonStore", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "skald-state-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("sin fichero, devuelve el estado vacío", async () => {
    const store = new JsonStore(path.join(dir, "a.json"), schema, () => ({ n: 0 }));
    expect(await store.load()).toEqual({ n: 0 });
  });

  it("guarda y vuelve a leer (creando la carpeta), sin dejar temporales", async () => {
    const store = new JsonStore(path.join(dir, "sub", "a.json"), schema, () => ({ n: 0 }));
    await store.save({ n: 1 });
    await store.save({ n: 2 });
    expect(await store.load()).toEqual({ n: 2 });
    expect(await readdir(path.join(dir, "sub"))).toEqual(["a.json"]);
  });

  it("aparta un fichero roto y empieza de cero", async () => {
    const file = path.join(dir, "a.json");
    await writeFile(file, "{ roto", "utf8");
    const store = new JsonStore(file, schema, () => ({ n: 0 }));
    expect(await store.load()).toEqual({ n: 0 });
    const files = await readdir(dir);
    expect(files.some((f) => f.startsWith("a.json.corrupt-"))).toBe(true);
    const aside = files.find((f) => f.startsWith("a.json.corrupt-")) ?? "";
    expect(await readFile(path.join(dir, aside), "utf8")).toBe("{ roto");
  });

  it("si no puede escribir, no lanza", async () => {
    const blocker = path.join(dir, "fichero");
    await writeFile(blocker, "", "utf8");
    const store = new JsonStore(path.join(blocker, "a.json"), schema, () => ({ n: 0 }));
    await expect(store.save({ n: 1 })).resolves.toBeUndefined();
  });
});
