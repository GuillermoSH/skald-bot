/**
 * Avisos de eventos del log en Discord (un canal por tipo, o uno para todos), con anti-spam:
 * - Se agrupan en ventanas de unos segundos (varias líneas por mensaje).
 * - Máximo de mensajes por minuto; lo que no cabe se cuenta y se resume.
 * - Salir y volver a entrar en poco tiempo no genera avisos.
 * - Al apagarse el servidor, un único aviso en vez de una salida por jugador.
 */
import type { Client } from "discord.js";
import type { AlertEventType, Config } from "./config.js";
import type { LogEvent } from "./core/logwatch.js";
import { fetchSendableChannel } from "./util/channels.js";
import { baseEmbed } from "./util/embeds.js";
import { safeText } from "./util/escape.js";
import { log } from "./util/log.js";
import { texts } from "./util/texts.js";

export interface AlertQueueOptions {
  batchMs: number;
  maxMessagesPerMinute: number;
  maxLinesPerMessage: number;
  /** Margen para salir y volver sin que se avise. */
  reconnectMs: number;
  /** Líneas pendientes como máximo; las más antiguas se descartan. */
  maxPending: number;
}

const DEFAULTS: AlertQueueOptions = {
  batchMs: 3000,
  maxMessagesPerMinute: 5,
  maxLinesPerMessage: 10,
  reconnectMs: 20_000,
  maxPending: 50,
};

export function alertTypeOf(event: LogEvent): AlertEventType {
  switch (event.type) {
    case "server_start":
    case "server_stop":
      return "server";
    default:
      return event.type;
  }
}

const bold = (player: string) => `**${safeText(player, 32)}**`;

export class AlertFormatter {
  private valhallaIndex = 0;
  private helIndex = 0;

  format(event: LogEvent): string {
    const t = texts.alerts;
    switch (event.type) {
      case "join":
        return t.join(bold(event.player));
      case "leave":
        return t.leave(bold(event.player));
      case "server_start":
        return t.serverStart;
      case "server_stop":
        return t.serverStop;
      case "advancement":
        if (event.first) return `${t.first[event.kind](bold(event.player), safeText(event.title, 100))}\n${t.firstNote}`;
        return t.advancement[event.kind](bold(event.player), safeText(event.title, 100));
      case "death": {
        const phrases = event.combat ? t.valhalla : t.hel;
        const index = event.combat ? this.valhallaIndex++ : this.helIndex++;
        const phrase = phrases[index % phrases.length] ?? phrases[0];
        const headline = phrase(bold(event.player));
        return `${event.combat ? "⚔️" : "🪦"} ${headline}\n-# ${safeText(event.spanish ?? event.english, 200)}`;
      }
    }
  }
}

export type AlertSender = (lines: string[]) => Promise<void>;

/** Cola de un canal: agrupa líneas en mensajes y respeta el límite por minuto. */
class ChannelBatcher {
  private pending: string[] = [];
  private dropped = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly sentAt: number[] = [];

  constructor(
    private readonly send: AlertSender,
    private readonly options: AlertQueueOptions,
    private readonly onError: (error: unknown) => void,
  ) {}

  enqueue(line: string): void {
    this.pending.push(line);
    if (this.pending.length > this.options.maxPending) {
      const excess = this.pending.length - this.options.maxPending;
      this.pending.splice(0, excess);
      this.dropped += excess;
    }
    this.schedule(this.options.batchMs);
  }

  dispose(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
  }

  private schedule(delayMs: number): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, delayMs);
  }

  private async flush(): Promise<void> {
    if (this.pending.length === 0) return;

    const now = Date.now();
    while (this.sentAt.length > 0 && now - (this.sentAt[0] ?? 0) >= 60_000) this.sentAt.shift();
    if (this.sentAt.length >= this.options.maxMessagesPerMinute) {
      this.schedule(60_000 - (now - (this.sentAt[0] ?? now)));
      return;
    }

    const lines = this.pending.splice(0, this.options.maxLinesPerMessage);
    if (this.dropped > 0 && this.pending.length === 0) {
      lines.push(texts.alerts.dropped(this.dropped));
      this.dropped = 0;
    }
    this.sentAt.push(now);
    try {
      await this.send(lines);
    } catch (error) {
      this.onError(error);
    }
    if (this.pending.length > 0) this.schedule(this.options.batchMs);
  }
}

/**
 * Reparte los eventos del log entre canales. `routes` dice a qué canal va cada
 * tipo de aviso (los que no están, no se avisan). Las reconexiones rápidas y la
 * parada del servidor se resuelven aquí, antes de repartir, para que funcionen
 * aunque entradas y salidas vayan a canales distintos.
 */
export class AlertQueue {
  private readonly options: AlertQueueOptions;
  private readonly formatter = new AlertFormatter();
  private readonly heldLeaves = new Map<string, NodeJS.Timeout>();
  /** Una cola por canal (mismo `AlertSender` = mismo canal = misma cola). */
  private readonly batchers = new Map<AlertSender, ChannelBatcher>();

  constructor(
    private readonly routes: ReadonlyMap<AlertEventType, AlertSender>,
    options: Partial<AlertQueueOptions> = {},
    private readonly onError: (error: unknown) => void = () => undefined,
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  push(event: LogEvent): void {
    if (event.type === "server_stop") {
      // Las salidas que llegan con la parada no se avisan una a una.
      for (const timer of this.heldLeaves.values()) clearTimeout(timer);
      this.heldLeaves.clear();
    }

    if (event.type === "leave") {
      if (!this.routes.has("leave")) return;
      // Se retiene un rato: si vuelve enseguida, no se avisa de nada.
      clearTimeout(this.heldLeaves.get(event.player));
      this.heldLeaves.set(
        event.player,
        setTimeout(() => {
          this.heldLeaves.delete(event.player);
          this.dispatch(event);
        }, this.options.reconnectMs),
      );
      return;
    }

    if (event.type === "join") {
      const held = this.heldLeaves.get(event.player);
      if (held) {
        clearTimeout(held);
        this.heldLeaves.delete(event.player);
        return; // Reconexión: ni salida ni entrada.
      }
    }

    this.dispatch(event);
  }

  /** Para pruebas y cierre ordenado. */
  dispose(): void {
    for (const batcher of this.batchers.values()) batcher.dispose();
    for (const timer of this.heldLeaves.values()) clearTimeout(timer);
    this.heldLeaves.clear();
  }

  private dispatch(event: LogEvent): void {
    const send = this.routes.get(alertTypeOf(event));
    if (!send) return;
    let batcher = this.batchers.get(send);
    if (!batcher) {
      batcher = new ChannelBatcher(send, this.options, this.onError);
      this.batchers.set(send, batcher);
    }
    batcher.enqueue(this.formatter.format(event));
  }
}

/** Prepara el envío al canal de avisos; null si no se puede escribir en él. */
export async function createChannelSender(client: Client<true>, channelId: string): Promise<AlertSender | null> {
  const channel = await fetchSendableChannel(client, channelId, "avisos");
  if (!channel) return null;
  return async (lines) => {
    await channel.send({ embeds: [baseEmbed().setDescription(lines.join("\n"))], allowedMentions: { parse: [] } });
  };
}

/**
 * Canal de cada tipo de aviso: el específico (`ALERT_CHANNEL_<TIPO>`) o el
 * general (`ALERT_CHANNEL_ID`). Solo los tipos activados en `ALERT_EVENTS`.
 */
export function alertChannelFor(config: Config): Map<AlertEventType, string> {
  const specific: Record<AlertEventType, string | undefined> = {
    join: config.ALERT_CHANNEL_JOIN,
    leave: config.ALERT_CHANNEL_LEAVE,
    death: config.ALERT_CHANNEL_DEATH,
    advancement: config.ALERT_CHANNEL_ADVANCEMENT,
    server: config.ALERT_CHANNEL_SERVER,
  };
  const out = new Map<AlertEventType, string>();
  for (const type of config.ALERT_EVENTS) {
    const channel = specific[type] ?? config.ALERT_CHANNEL_ID;
    if (channel) out.set(type, channel);
  }
  return out;
}

/** Abre cada canal una sola vez y monta las rutas tipo → envío. */
export async function buildAlertRoutes(client: Client<true>, config: Config): Promise<Map<AlertEventType, AlertSender>> {
  const routes = new Map<AlertEventType, AlertSender>();
  const senders = new Map<string, AlertSender | null>();
  for (const [type, channelId] of alertChannelFor(config)) {
    if (!senders.has(channelId)) senders.set(channelId, await createChannelSender(client, channelId));
    const send = senders.get(channelId);
    if (send) routes.set(type, send);
  }
  const summary = [...alertChannelFor(config)].map(([type, id]) => `${type}→${id}`).join(", ");
  if (routes.size > 0) log.info(`Avisos activados: ${summary}`);
  return routes;
}
