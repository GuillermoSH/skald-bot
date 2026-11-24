import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NameResolver } from "../src/core/names.js";

const DATA = path.resolve("test/fixtures/data");
const RAGNAR = "11111111-1111-4111-8111-111111111111";
const IVAR = "44444444-4444-4444-8444-444444444444";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("NameResolver", () => {
  it("usa usercache.json sin tocar la red", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const names = await new NameResolver(DATA, fetchMock).resolve([RAGNAR]);
    expect(names.get(RAGNAR)).toBe("Ragnar");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si no está en usercache pregunta a Mojang (UUID sin guiones)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: "x", name: "Ivar" }));
    const resolver = new NameResolver(DATA, fetchMock);
    expect((await resolver.resolve([IVAR])).get(IVAR)).toBe("Ivar");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("44444444444444448444444444444444");
    // Queda en memoria: la segunda vez no hay llamada.
    await resolver.resolve([IVAR]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("peek no usa la red", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const known = await new NameResolver(DATA, fetchMock).peek([RAGNAR, IVAR]);
    expect([...known.values()]).toEqual(["Ragnar"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rechaza nombres no válidos que vengan de fuera", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ name: "@everyone <script>" }));
    expect((await new NameResolver(DATA, fetchMock).resolve([IVAR])).has(IVAR)).toBe(false);
  });

  it("si Mojang falla no reintenta en cada consulta", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const resolver = new NameResolver(DATA, fetchMock);
    await resolver.resolve([IVAR]);
    await resolver.resolve([IVAR]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("NameResolver · consultas simultáneas", () => {
  it("todas ven el usercache, sin ir a Mojang", async () => {
    let calls = 0;
    const fakeFetch = (() => {
      calls++;
      return Promise.reject(new Error("sin red"));
    }) as unknown as typeof fetch;
    const r = new NameResolver(DATA, fakeFetch);
    const [a, b] = await Promise.all([
      r.resolve(["11111111-1111-4111-8111-111111111111"]),
      r.resolve(["33333333-3333-4333-8333-333333333333"]),
    ]);
    expect(a.get("11111111-1111-4111-8111-111111111111")).toBe("Ragnar");
    expect(b.get("33333333-3333-4333-8333-333333333333")).toBe("Floki");
    expect(calls).toBe(0);
  });
});
