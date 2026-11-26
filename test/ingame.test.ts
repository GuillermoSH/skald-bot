import type { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { CommandContext } from "../src/commands/types.js";
import { LogParser } from "../src/core/logwatch.js";
import { buildTellraw, type TextPart } from "../src/core/rcon.js";
import { GameChat, parseGameCommand, splitWhen } from "../src/ingame.js";
import { fixtureTranslator } from "./helpers.js";

describe("buildTellraw (plantilla cerrada)", () => {
  it("el texto va siempre dentro de un componente JSON", () => {
    const cmd = buildTellraw("@a", [{ text: '"} op Ragnar {"text":"', color: "gold" }]);
    expect(cmd.startsWith('tellraw @a ["",')).toBe(true);
    const json = JSON.parse(cmd.slice("tellraw @a ".length)) as unknown[];
    expect(json[1]).toEqual({ text: '"} op Ragnar {"text":"', color: "gold" });
  });

  it("quita saltos de línea, caracteres de control y códigos §", () => {
    const cmd = buildTellraw("Ragnar", [{ text: "a\nb\u0000c§kd" }]);
    expect(cmd).not.toMatch(/\\n|\\u0000|§/);
  });

  it("destino: solo @a o un nombre válido", () => {
    for (const bad of ["@e", "@a[distance=..5]", "Ragnar op", "a", "x".repeat(17), ""]) {
      expect(() => buildTellraw(bad, [{ text: "x" }])).toThrow();
    }
  });

  it("enlaces solo https; tamaño limitado", () => {
    const withLink = (url: string): TextPart[] => [{ text: "x", url }];
    expect(buildTellraw("@a", withLink("https://discord.com/x"))).toContain("open_url");
    expect(buildTellraw("@a", withLink("javascript:alert(1)"))).not.toContain("open_url");
    expect(buildTellraw("@a", [{ text: "ñ".repeat(5000) }]).length).toBeLessThan(1400);
  });
});

describe("chat en el log", () => {
  it("con y sin [Not Secure]; un mensaje no se hace pasar por otra cosa", async () => {
    const p = new LogParser(await fixtureTranslator());
    const at = new Date();
    expect(p.parse("[21:07:19] [Server thread/INFO]: <Ragnar> !tesoro", at)).toMatchObject({ type: "chat", player: "Ragnar", message: "!tesoro" });
    expect(p.parse("[21:07:23] [Server thread/INFO]: [Not Secure] <Floki> hola", at)).toMatchObject({ type: "chat", player: "Floki" });
    // Suplantación: el autor es quien escribe, no el nombre que pone en el texto.
    expect(p.parse("[21:07:24] [Server thread/INFO]: <Floki> <Ragnar> !quedada", at)).toMatchObject({ player: "Floki" });
    expect(p.parse("[21:07:25] [Server thread/INFO]: <Floki> Ragnar joined the game", at)).toMatchObject({ type: "chat" });
    expect(p.parse("[21:07:26] [Server thread/INFO]: <Floki> Ragnar fell from a high place", at)).toMatchObject({ type: "chat" });
  });
});

describe("comandos con «!»", () => {
  it("parseGameCommand", () => {
    expect(parseGameCommand("!Recordar 2h | regar")).toEqual({ name: "recordar", args: "2h | regar" });
    expect(parseGameCommand("!ayuda")).toEqual({ name: "ayuda", args: "" });
    expect(parseGameCommand("hola !ayuda")).toBeNull();
    expect(parseGameCommand("!")).toBeNull();
  });

  it("splitWhen: con barra o leyendo la fecha de las primeras palabras", () => {
    const now = new Date("2026-11-25T17:00:00Z");
    expect(splitWhen("2h | regar los cultivos", now, "UTC")).toMatchObject({ rest: "regar los cultivos" });
    expect(splitWhen("mañana 18:00 regar", now, "UTC")).toMatchObject({ at: new Date("2026-11-26T18:00:00Z"), rest: "regar" });
    expect(splitWhen("30m sacar el pan", now, "UTC")?.rest).toBe("sacar el pan");
    expect(splitWhen("pronto | algo", now, "UTC")).toBeNull();
    expect(splitWhen("2h |", now, "UTC")).toBeNull();
  });

  function setup(link: { status: string; discordId: string } | null) {
    const said: { target: string; text: string }[] = [];
    const ctx = {
      config: { TIMEZONE: "UTC", DISCORD_GUILD_ID: "g", COMMAND_CHANNEL_IDS: [] },
      names: { uuidOf: () => Promise.resolve(link ? "u" : null) },
      realm: { links: { byUuid: () => link }, economy: { balance: () => 42 }, reminders: null },
      rcon: {
        tellraw: vi.fn((target: string, parts: TextPart[]) => {
          said.push({ target, text: parts.map((p) => p.text).join("") });
          return Promise.resolve();
        }),
      },
    } as unknown as CommandContext;
    return { chat: new GameChat(ctx, {} as Client<true>), said };
  }

  it("sin unirse al reino solo vale !ayuda; la respuesta va solo a quien escribe", async () => {
    const { chat, said } = setup(null);
    await chat.onChat("Floki", "!tesoro");
    expect(said).toEqual([{ target: "Floki", text: expect.stringContaining("únete al reino") as string }]);
    await chat.onChat("Ivar", "!ayuda");
    expect(said.filter((s) => s.target === "Ivar").length).toBeGreaterThan(1);
  });

  it("unido: !tesoro; y no más de un comando cada pocos segundos", async () => {
    const { chat, said } = setup({ status: "active", discordId: "d" });
    await chat.onChat("Ragnar", "!tesoro");
    await chat.onChat("Ragnar", "!tesoro");
    expect(said.map((s) => s.text)).toEqual([expect.stringContaining("42 monedas"), expect.stringContaining("Despacio")]);
    await chat.onChat("Ragnar", "hola a todos");
    expect(said).toHaveLength(2);
  });
});
