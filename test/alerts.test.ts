import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertFormatter, AlertQueue } from "../src/alerts.js";
import { ALERT_EVENT_TYPES, type AlertEventType } from "../src/config.js";
import type { LogEvent } from "../src/core/logwatch.js";

const at = new Date("2026-11-22T10:00:00");
const join = (player: string): LogEvent => ({ type: "join", at, player });
const leave = (player: string): LogEvent => ({ type: "leave", at, player });
const death = (player: string, combat: boolean): LogEvent => ({
  type: "death",
  at,
  player,
  english: `${player} died`,
  spanish: `${player} ha muerto`,
  combat,
});

function setup(enabled: readonly AlertEventType[] = ALERT_EVENT_TYPES) {
  const sent: string[][] = [];
  const send = (lines: string[]) => {
    sent.push(lines);
    return Promise.resolve();
  };
  const queue = new AlertQueue(new Map(enabled.map((t) => [t, send])), {
    batchMs: 1000,
    reconnectMs: 5000,
    maxMessagesPerMinute: 2,
    maxLinesPerMessage: 3,
  });
  return { sent, queue };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("AlertQueue", () => {
  it("agrupa los eventos cercanos en un solo mensaje", async () => {
    const { sent, queue } = setup();
    queue.push(join("Ragnar"));
    queue.push(join("Lagertha"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(2);
  });

  it("salir y volver enseguida no genera avisos", async () => {
    const { sent, queue } = setup();
    queue.push(leave("Ragnar"));
    await vi.advanceTimersByTimeAsync(2000);
    queue.push(join("Ragnar"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual([]);
  });

  it("una salida de verdad se avisa pasado el margen", async () => {
    const { sent, queue } = setup();
    queue.push(leave("Ragnar"));
    await vi.advanceTimersByTimeAsync(6000);
    expect(sent.flat().join()).toContain("ha abandonado el reino");
  });

  it("al apagarse el servidor, un solo aviso y sin salidas", async () => {
    const { sent, queue } = setup();
    queue.push(leave("Ragnar"));
    queue.push(leave("Lagertha"));
    queue.push({ type: "server_stop", at });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual([["🌑 El reino se apaga."]]);
  });

  it("respeta el límite de mensajes por minuto y no pierde nada", async () => {
    const { sent, queue } = setup();
    for (const name of ["Aa1", "Bb2", "Cc3", "Dd4", "Ee5", "Ff6", "Gg7"]) queue.push(join(name));
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toHaveLength(2); // 3 + 3 líneas; la 7.ª espera
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent.flat()).toHaveLength(7);
  });

  it("solo avisa de los tipos activados", async () => {
    const { sent, queue } = setup(["death"]);
    queue.push(join("Ragnar"));
    queue.push(death("Ragnar", true));
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent.flat()).toHaveLength(1);
    expect(sent.flat()[0]).toContain("Ragnar");
  });
});

describe("un canal por tipo de aviso", () => {
  it("cada tipo va a su canal, y la reconexión se detecta aunque entrada y salida vayan a canales distintos", async () => {
    const joins: string[][] = [];
    const deaths: string[][] = [];
    const leaves: string[][] = [];
    const to = (box: string[][]) => (lines: string[]) => {
      box.push(lines);
      return Promise.resolve();
    };
    const queue = new AlertQueue(
      new Map<AlertEventType, (lines: string[]) => Promise<void>>([
        ["join", to(joins)],
        ["leave", to(leaves)],
        ["death", to(deaths)],
      ]),
      { batchMs: 1000, reconnectMs: 5000 },
    );
    queue.push(join("Ragnar"));
    queue.push(death("Ragnar", true));
    queue.push(leave("Lagertha"));
    await vi.advanceTimersByTimeAsync(1000);
    queue.push(join("Lagertha")); // vuelve enseguida
    await vi.advanceTimersByTimeAsync(10_000);
    expect(joins.flat()).toHaveLength(1);
    expect(deaths.flat()).toHaveLength(1);
    expect(leaves).toEqual([]);
    queue.dispose();
  });

  it("los tipos sin canal no se avisan", async () => {
    const { sent, queue } = setup(["death"]);
    queue.push({ type: "server_start", at });
    await vi.advanceTimersByTimeAsync(2000);
    expect(sent).toEqual([]);
  });
});

describe("AlertFormatter", () => {
  it("combate → Valhalla; sin gloria → Hel; con el mensaje en español debajo", () => {
    const f = new AlertFormatter();
    const combat = f.format(death("Ragnar", true));
    const silly = f.format(death("Ragnar", false));
    expect(combat).toMatch(/^⚔️ .*Valhalla|^⚔️ .*valquirias|^⚔️ .*Odín/);
    expect(silly).toMatch(/^🪦 .*(Hel|Helheim)/);
    expect(combat).toContain("-# Ragnar ha muerto");
  });

  it("va alternando las frases", () => {
    const f = new AlertFormatter();
    const first = f.format(death("Ragnar", true));
    const second = f.format(death("Ragnar", true));
    expect(first).not.toBe(second);
  });

  it("escapa nombres y no permite menciones", () => {
    const f = new AlertFormatter();
    const line = f.format({ type: "advancement", at, player: "Ragnar_X", kind: "goal", title: "@everyone *gana*", key: null });
    expect(line).toContain("Ragnar\\_X");
    expect(line).not.toContain("@everyone");
  });
});

describe("AlertFormatter · primero del reino", () => {
  it("destaca el primer logro del reino", () => {
    const line = new AlertFormatter().format({
      type: "advancement",
      at: new Date(),
      player: "Ragnar",
      kind: "challenge",
      title: "Cálidos destinos turísticos",
      key: "advancements.nether.explore_nether.title",
      first: true,
    });
    expect(line).toContain("¡Primero del reino!");
    expect(line).toContain("**Ragnar**");
    expect(line).toContain("desafío **[Cálidos destinos turísticos]**");
  });
});

describe("AlertQueue · avisos que no salen del log", () => {
  it("van al canal de su tipo", async () => {
    vi.useFakeTimers();
    const sent: string[][] = [];
    const queue = new AlertQueue(new Map([["advancement", (lines: string[]) => { sent.push(lines); return Promise.resolve(); }]]), { batchMs: 10 });
    queue.pushLine("advancement", "hito");
    queue.pushLine("join", "no va a ningún sitio");
    await vi.advanceTimersByTimeAsync(20);
    expect(sent).toEqual([["hito"]]);
    queue.dispose();
    vi.useRealTimers();
  });
});
