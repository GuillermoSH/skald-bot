import type { Role } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditFeed, describeAudit, roleChanges } from "../src/audit.js";
import { AuditParser } from "../src/core/audit.js";
import { LogParser } from "../src/core/logwatch.js";
import { fixtureTranslator } from "./helpers.js";

const parser = new AuditParser();

describe("AuditParser (formato real de 26.2)", () => {
  it("modo de juego propio y de otro", () => {
    expect(parser.parse("[Ragnar: Set own game mode to Creative Mode]")).toEqual({
      action: "gamemode_self", actor: "Ragnar", via: "player", target: "Ragnar", mode: "Creative Mode", reason: null,
    });
    expect(parser.parse("[Ragnar: Set Floki's game mode to Survival Mode]")).toMatchObject({ action: "gamemode_other", actor: "Ragnar", target: "Floki", mode: "Survival Mode" });
  });

  it("op, ban con motivo, kick, whitelist; desde la consola sin actor", () => {
    expect(parser.parse("[Ragnar: Made Floki a server operator]")).toMatchObject({ action: "op", target: "Floki" });
    expect(parser.parse("Made Floki no longer a server operator")).toMatchObject({ action: "deop", actor: null, target: "Floki" });
    expect(parser.parse("[Ragnar: Banned Ivar: griefing en la aldea]")).toMatchObject({ action: "ban", target: "Ivar", reason: "griefing en la aldea" });
    expect(parser.parse("[Ragnar: Kicked Ivar: a dormir]")).toMatchObject({ action: "kick", reason: "a dormir" });
    expect(parser.parse("[Server: Added Floki to the whitelist]")).toMatchObject({ action: "whitelist_add", actor: null });
  });

  it("RCON cuenta (rcon-cli), pero no lo que manda Skald; ni baneos de IP ni lo demás", () => {
    expect(parser.parse("[Rcon: Made Floki a server operator]")).toMatchObject({ action: "op", actor: null, via: "rcon", target: "Floki" });
    expect(parser.parse("[Rcon: Played sound minecraft:item.goat_horn.sound.0 to Ragnar]")).toBeNull();
    expect(parser.parse("[Rcon: Set the gamerule players_sleeping_percentage to 50]")).toBeNull();
    expect(parser.parse("[Ragnar: Banned IP 192.0.2.10: spam]")).toBeNull();
    expect(parser.parse("Ragnar joined the game")).toBeNull();
  });

  it("el log lo entrega como evento de administración (y el chat no lo suplanta)", async () => {
    const log = new LogParser(await fixtureTranslator());
    const at = new Date();
    expect(log.parse("[22:15:13] [Server thread/INFO]: [Ragnar: Set own game mode to Spectator Mode]", at)).toMatchObject({ type: "admin" });
    expect(log.parse("[22:15:14] [Server thread/INFO]: <Floki> [Ragnar: Made Floki a server operator]", at)?.type).toBe("chat");
  });
});

describe("describeAudit", () => {
  const lang = { gameModeName: (m: string) => (m === "Creative Mode" ? "Modo creativo" : m) };
  const parse = (line: string) => {
    const a = parser.parse(line);
    if (!a) throw new Error(`no se reconoce: ${line}`);
    return a;
  };
  it("en español, escapado, y la consola con nombre", () => {
    expect(describeAudit(parse("[Ragnar: Set own game mode to Creative Mode]"), lang)).toBe("🎮 **Ragnar** se ha puesto en **Modo creativo**.");
    expect(describeAudit(parse("Banned Ivar: *spam*"), lang)).toBe("🔨 la consola ha desterrado a **Ivar**: «\\*spam\\*».");
    expect(describeAudit(parse("[Rcon: Made Floki a server operator]"), lang)).toBe("👑 la consola (RCON) ha hecho operador a **Floki**.");
  });
});

describe("roleChanges", () => {
  const guild = { id: "g" };
  const role = (id: string, managed = false) => ({ id, name: id, managed, guild }) as unknown as Role;
  it("sin los automáticos de Skald, los gestionados ni @everyone", () => {
    const before = [role("g"), role("viajero"), role("einherjar")];
    const after = [role("g"), role("huscarl"), role("booster", true), role("einherjar")];
    const { added, removed } = roleChanges(before, after, new Set(["viajero", "einherjar"]));
    expect(added.map((r) => r.id)).toEqual(["huscarl"]);
    expect(removed).toEqual([]);
  });
});

describe("AuditFeed", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("agrupa lo que llega seguido en un mensaje", async () => {
    const sent: string[][] = [];
    const feed = new AuditFeed((_title, lines) => {
      sent.push(lines);
      return Promise.resolve();
    });
    feed.push("a");
    feed.push("b");
    await vi.advanceTimersByTimeAsync(6_000);
    feed.push("c");
    await vi.advanceTimersByTimeAsync(6_000);
    expect(sent).toEqual([["a", "b"], ["c"]]);
  });
});
