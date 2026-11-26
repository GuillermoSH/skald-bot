import type { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { CommandContext } from "../src/commands/types.js";
import { LogParser } from "../src/core/logwatch.js";
import { buildPlaysound, buildTellraw, type TextPart } from "../src/core/rcon.js";
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
          said.push({ target, text: parts.map((p) => ("text" in p ? p.text : "br" in p ? "\n" : `[${p.head}]`)).join("") });
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

describe("saludo al entrar", () => {
  function setup(link: { status: string; discordId: string } | null, online: string[]) {
    const said: { target: string; text: string }[] = [];
    const ctx = {
      config: { TIMEZONE: "UTC", DISCORD_GUILD_ID: "g", COMMAND_CHANNEL_IDS: [] },
      names: { uuidOf: () => Promise.resolve(link ? "u" : "otro") },
      realm: { links: { byUuid: () => link }, economy: { balance: () => 1234 }, reminders: null },
      rcon: {
        playSound: (target: string) => {
          said.push({ target, text: "♪" });
          return Promise.resolve();
        },
        listPlayers: () => Promise.resolve({ online: online.length, max: 20, names: online }),
        tellraw: (target: string, parts: TextPart[]) => {
          said.push({ target, text: parts.map((p) => ("text" in p ? p.text : "br" in p ? "\n" : `[${p.head}]`)).join("") });
          return Promise.resolve();
        },
      },
    } as unknown as CommandContext;
    return { chat: new GameChat(ctx, {} as Client<true>), said };
  }

  it("unido: un solo mensaje (cabeza, quién más está, monedas) y el cuerno; solo a él; sin repetir", async () => {
    const { chat, said } = setup({ status: "active", discordId: "d" }, ["Ragnar", "Lagertha"]);
    await chat.onJoin("Ragnar", 0);
    expect(said.every((s) => s.target === "Ragnar")).toBe(true);
    expect(said).toHaveLength(2);
    expect(said[0]?.text).toMatch(/^\[Skald\] \[Ragnar\] ⚔ .*Ragnar.*\n.*Lagertha.*\n.*1\.?234 monedas.*!ayuda$/s);
    expect(said[1]?.text).toBe("♪");
    await chat.onJoin("Ragnar", 0);
    expect(said).toHaveLength(2);
  });

  it("sin unirse: le dice cómo hacerlo; solo: lo dice", async () => {
    const { chat, said } = setup(null, ["Floki"]);
    await chat.onJoin("Floki", 0);
    const text = said.map((s) => s.text).join(" ");
    expect(text).toContain("único guerrero");
    expect(text).toContain("Acepto las runas");
  });
});

describe("plantillas: cabeza, salto de línea y sonido", () => {
  it("cabeza y salto solo como piezas de Skald; el texto de un jugador no mete saltos", () => {
    const cmd = buildTellraw("@a", [{ head: "Ragnar" }, { br: true }, { text: "a\nb" }]);
    const json = JSON.parse(cmd.slice("tellraw @a ".length)) as unknown[];
    expect(json[1]).toEqual({ object: "player", player: { name: "Ragnar" }, hat: true });
    expect(json[2]).toEqual({ text: "\n" });
    expect(json[3]).toEqual({ text: "a b" });
    expect(() => buildTellraw("@a", [{ head: "@e" }])).toThrow();
  });

  it("clic para dejar un comando: solo comandos «!» de Skald", () => {
    expect(buildTellraw("@a", [{ text: "x", suggest: "!ayuda" }])).toContain("suggest_command");
    expect(buildTellraw("@a", [{ text: "x", suggest: "/op Ragnar" }])).not.toContain("suggest_command");
  });

  it("playsound: sonido de la lista y a un jugador", () => {
    expect(buildPlaysound("Ragnar", "horn")).toBe("playsound minecraft:item.goat_horn.sound.0 master Ragnar ~ ~ ~ 0.5 1 0.5");
    expect(() => buildPlaysound("@a", "horn")).toThrow();
    expect(() => buildPlaysound("Ragnar x", "horn")).toThrow();
  });
});
