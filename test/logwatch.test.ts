import { appendFile, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Translator } from "../src/core/lang.js";
import { logTimeToDate, LogParser, LogTailer, type LogEvent } from "../src/core/logwatch.js";
import { FIXTURE_DATA, fixtureTranslator } from "./helpers.js";

const NOW = new Date("2026-11-22T12:00:00");
const strip = (e: LogEvent | null) => (e ? { ...e, at: undefined } : null);

describe("LogParser", () => {
  it("saca del log de ejemplo solo los eventos que importan", async () => {
    const parser = new LogParser(await fixtureTranslator());
    const lines = (await readFile(path.join(FIXTURE_DATA, "logs", "latest.log"), "utf8")).split("\n");
    const events = lines.map((l) => strip(parser.parse(l, NOW))).filter((e) => e !== null);
    expect(events).toEqual([
      { type: "server_start", at: undefined },
      { type: "join", at: undefined, player: "Ragnar" },
      {
        type: "death",
        at: undefined,
        player: "Ragnar",
        english: "Ragnar was blown up by Creeper",
        spanish: "Ragnar ha explotado por Creeper",
        combat: true,
      },
      { type: "advancement", at: undefined, player: "Ragnar", kind: "task", title: "Cálidos destinos turísticos" },
      {
        type: "death",
        at: undefined,
        player: "Ragnar",
        english: "Ragnar fell from a high place",
        spanish: "Ragnar ha caído desde muy alto",
        combat: false,
      },
      { type: "leave", at: undefined, player: "Ragnar" },
      { type: "server_stop", at: undefined },
    ]);
  });

  it("ignora chat, comandos de RCON y líneas con IP", async () => {
    const parser = new LogParser(await fixtureTranslator());
    expect(parser.parse("[10:02:00] [Server thread/INFO]: <Ragnar> Ragnar was blown up by Creeper", NOW)).toBeNull();
    expect(parser.parse("[10:05:00] [Server thread/INFO]: [Rcon: Ragnar drowned]", NOW)).toBeNull();
    expect(parser.parse("[10:01:00] [Server thread/INFO]: Ragnar[/192.0.2.10:5] logged in with entity id 1", NOW)).toBeNull();
    expect(parser.parse("[10:01:00] [User Authenticator #1/INFO]: UUID of player Ragnar is x", NOW)).toBeNull();
  });

  it("distingue los tres tipos de logro", async () => {
    const parser = new LogParser(await fixtureTranslator());
    const kind = (line: string) => {
      const e = parser.parse(`[10:00:00] [Server thread/INFO]: ${line}`, NOW);
      return e?.type === "advancement" ? e.kind : null;
    };
    expect(kind("Ragnar has completed the challenge [Monsters Hunted]")).toBe("challenge");
    expect(kind("Ragnar has reached the goal [Sky's the Limit]")).toBe("goal");
  });

  it("sin plantillas, detecta muertes de jugadores conectados como respaldo", () => {
    const noTemplates = new Translator(() => Promise.resolve(null));
    const parser = new LogParser(noTemplates);
    const line = (msg: string) => `[10:00:00] [Server thread/INFO]: ${msg}`;
    expect(parser.parse(line("Ragnar was squashed by a falling anvil"), NOW)).toBeNull(); // no conectado
    parser.parse(line("Ragnar joined the game"), NOW);
    expect(parser.parse(line("Ragnar was squashed by a falling anvil"), NOW)).toMatchObject({
      type: "death",
      player: "Ragnar",
      spanish: null,
      combat: true,
    });
  });
});

describe("logTimeToDate", () => {
  it("usa el día de hoy, o el de ayer si la hora queda en el futuro", () => {
    expect(logTimeToDate(NOW, 10, 0, 0).getDate()).toBe(22);
    expect(logTimeToDate(NOW, 23, 59, 0).getDate()).toBe(21);
  });
});

describe("LogTailer", () => {
  it("entrega el histórico, luego lo nuevo, y sobrevive a la rotación", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "skald-"));
    const file = path.join(dir, "latest.log");
    await writeFile(file, "vieja 1\nvieja 2\n");
    const seen: [string, boolean][] = [];
    const tailer = new LogTailer(file, (line, live) => seen.push([line, live]));

    await tailer.start();
    expect(seen).toEqual([
      ["vieja 1", false],
      ["vieja 2", false],
    ]);

    await appendFile(file, "nueva 1\nmedia lín");
    await tailer.poll();
    expect(seen.slice(2)).toEqual([["nueva 1", true]]);

    await appendFile(file, "ea\n");
    await tailer.poll();
    expect(seen.slice(3)).toEqual([["media línea", true]]);

    // Rotación: el fichero se archiva y aparece uno nuevo y más pequeño.
    await rename(file, path.join(dir, "2026-11-22-1.log"));
    await writeFile(file, "día nuevo\n");
    await tailer.poll();
    expect(seen.slice(4)).toEqual([["día nuevo", true]]);
  });

  it("no falla si el fichero aún no existe", async () => {
    const tailer = new LogTailer("/no/existe/latest.log", () => undefined);
    await expect(tailer.start()).resolves.toBeUndefined();
  });
});
