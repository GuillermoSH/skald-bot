import type { Client, Guild } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { Links } from "../src/core/links.js";
import { dashedUuid, MojangClient, MojangUnavailableError } from "../src/core/mojang.js";
import { NameResolver } from "../src/core/names.js";
import { WorldStats } from "../src/core/stats.js";
import { Linking } from "../src/linking.js";
import { FIXTURE_DATA, memoryRealm } from "./helpers.js";

const RAGNAR = "11111111-1111-4111-8111-111111111111"; // tiene estadísticas en el mundo de ejemplo
const NEW = "99999999-9999-4999-8999-999999999999";
const D1 = "100000000000000001";
const D2 = "100000000000000002";

describe("Links", () => {
  it("una cuenta por persona y una persona por cuenta", () => {
    const l = new Links(memoryRealm().db);
    l.create(D1, RAGNAR, "Ragnar", null);
    expect(l.conflict(D1, NEW)).toBe("discord_taken");
    expect(l.conflict(D2, RAGNAR.toUpperCase())).toBe("uuid_taken");
    expect(() => l.create(D2, RAGNAR, "Ragnar", null)).toThrow();
    expect(l.conflict(D2, NEW)).toBeNull();
  });

  it("activar, refrescar nombre y desvincular", () => {
    const l = new Links(memoryRealm().db);
    l.create(D1, RAGNAR, "Ragnar", "admin");
    l.activate(D1);
    l.seen(RAGNAR, "RagnarLodbrok");
    expect(l.byUuid(RAGNAR)).toMatchObject({ status: "active", mcName: "RagnarLodbrok", linkedBy: "admin" });
    expect(l.remove(D1)?.mcName).toBe("RagnarLodbrok");
    expect(l.byDiscord(D1)).toBeNull();
  });
});

describe("MojangClient", () => {
  const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

  it("UUID con guiones; 404 = no existe; caché", async () => {
    const fetchImpl = vi.fn((url: string) =>
      url.includes("Nadie") ? Promise.resolve(new Response("", { status: 404 })) : ok({ id: "069a79f444e94726a5befca90e38aaf5", name: "Notch" }),
    );
    const m = new MojangClient(fetchImpl as unknown as typeof fetch);
    expect(await m.lookup("notch")).toEqual({ uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5", name: "Notch" });
    await m.lookup("NOTCH");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(await m.lookup("Nadie")).toBeNull();
  });

  it("si el primero falla, prueba el antiguo; si fallan los dos, lo dice", async () => {
    const calls: string[] = [];
    const flaky = ((url: string) => {
      calls.push(url);
      return url.includes("minecraftservices") ? Promise.reject(new Error("caído")) : ok({ id: "069a79f444e94726a5befca90e38aaf5", name: "Notch" });
    }) as unknown as typeof fetch;
    expect((await new MojangClient(flaky).lookup("Notch"))?.name).toBe("Notch");
    expect(calls).toHaveLength(2);
    const down = (() => Promise.reject(new Error("sin red"))) as unknown as typeof fetch;
    await expect(new MojangClient(down).lookup("Notch")).rejects.toBeInstanceOf(MojangUnavailableError);
  });

  it("dashedUuid", () => {
    expect(dashedUuid("069A79F444E94726A5BEFCA90E38AAF5")).toBe("069a79f4-44e9-4726-a5be-fca90e38aaf5");
  });
});

describe("Linking", () => {
  const config = {
    ...loadConfig({ DISCORD_TOKEN: "x", DISCORD_GUILD_ID: "123456789012345678", RCON_PASSWORD: "x", AUTO_ROLE_ID: "200000000000000001" }),
    PLAYER_ROLE_ID: "200000000000000002",
  };

  function setup() {
    const links = new Links(memoryRealm().db);
    const added: string[] = [];
    const removed: string[] = [];
    const member = {
      user: { bot: false },
      roles: {
        cache: new Map([["200000000000000001", {}]]),
        add: (id: string) => {
          added.push(id);
          return Promise.resolve();
        },
        remove: (id: string) => {
          removed.push(id);
          return Promise.resolve();
        },
      },
    };
    const guild = { members: { fetch: () => Promise.resolve(member) } } as unknown as Guild;
    const notices: string[] = [];
    const linking = new Linking(config, links, new MojangClient(), new NameResolver(FIXTURE_DATA), new WorldStats(FIXTURE_DATA), (m) => {
      notices.push(m);
      return Promise.resolve();
    });
    return { links, linking, guild, added, removed, notices };
  }

  it("quien ya ha jugado es Einherjar al momento (y pierde Viajero)", async () => {
    const { linking, guild, added, removed, notices } = setup();
    const r = await linking.link(guild, D1, RAGNAR.replaceAll("-", ""), "Ragnar", null);
    expect(r).toMatchObject({ kind: "ok", link: { status: "active" } });
    expect(added).toEqual(["200000000000000002"]);
    expect(removed).toEqual(["200000000000000001"]);
    expect(notices[0]).toContain("Ragnar");
    expect(linking.roleOnJoin(D1)).toBe("200000000000000002");
  });

  it("quien no ha jugado queda pendiente hasta su primer login", async () => {
    const { linking, links, guild, added } = setup();
    const r = await linking.link(guild, D2, NEW.replaceAll("-", ""), "Nuevo", null);
    expect(r).toMatchObject({ kind: "ok", link: { status: "pending" } });
    expect(added).toEqual([]);
    expect(linking.roleOnJoin(D2)).toBe("200000000000000001");
    expect(await linking.link(guild, D2, RAGNAR.replaceAll("-", ""), "Ragnar", null)).toMatchObject({ kind: "discord_taken" });

    // Primer login (Floki está en el usercache de ejemplo): se cambia la vinculación a su UUID para probar.
    links.remove(D2);
    links.create(D2, "33333333-3333-4333-8333-333333333333", "Floki", null);
    const client = {
      guilds: { fetch: () => Promise.resolve(guild) },
      users: { send: () => Promise.resolve() },
    } as unknown as Client<true>;
    await linking.onPlayerJoin(client, "Floki");
    expect(links.byDiscord(D2)?.status).toBe("active");
    expect(added).toEqual(["200000000000000002"]);
  });
});
