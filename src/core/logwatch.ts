/**
 * Seguimiento de logs/latest.log (solo lectura): entradas, salidas, muertes,
 * logros y arranque/parada del servidor. Formato verificado en vanilla 26.2.
 *
 * El servidor rota el fichero con la primera línea de cada día (latest.log
 * pasa a AAAA-MM-DD-n.log.gz y se crea uno nuevo): se detecta porque cambia
 * el inodo o el tamaño baja.
 */
import { open, stat } from "node:fs/promises";
import path from "node:path";
import { log } from "../util/log.js";
import { AuditParser, type AuditMatch } from "./audit.js";
import type { Translator } from "./lang.js";

export type AdvancementKind = "task" | "challenge" | "goal";

export type LogEvent =
  | { type: "join"; at: Date; player: string }
  | { type: "leave"; at: Date; player: string }
  | {
      type: "death";
      at: Date;
      player: string;
      /** Mensaje original del log (inglés). */
      english: string;
      /** Mensaje en español, si hay plantillas. */
      spanish: string | null;
      /** Murió a manos de alguien (mob o jugador). */
      combat: boolean;
      /** Plantilla (`death.*`) y asesino en inglés tal cual sale en el log; null sin plantillas. */
      cause?: { key: string; killer: string | null } | null;
    }
  | {
      type: "advancement";
      at: Date;
      player: string;
      kind: AdvancementKind;
      /** Título en español (o el del log si no hay traducción). */
      title: string;
      /** Clave de idioma del logro (ver `advancementKey`), o null si no se reconoce. */
      key: string | null;
      /** Nadie en el reino lo tenía antes (lo decide quien recibe el evento). */
      first?: boolean;
    }
  /** Acción de administración (modo de juego, op, ban, kick, whitelist). */
  | { type: "admin"; at: Date; audit: AuditMatch }
  /** Mensaje de chat de un jugador (`<Nombre> texto`, con o sin «[Not Secure]»). */
  | { type: "chat"; at: Date; player: string; message: string }
  | { type: "server_start"; at: Date }
  | { type: "server_stop"; at: Date };

// ------------------------------------------------------------- parser

const LINE_RE = /^\[(\d{2}):(\d{2}):(\d{2})\] \[Server thread\/INFO\]: (.+)$/;
const NAME = "[A-Za-z0-9_]{3,16}";
const JOIN_RE = new RegExp(`^(${NAME})(?: \\(formerly known as ${NAME}\\))? joined the game$`);
const LEAVE_RE = new RegExp(`^(${NAME}) left the game$`);
const ADVANCEMENT_RE = new RegExp(`^(${NAME}) has (made the advancement|completed the challenge|reached the goal) \\[(.+)\\]$`);
// Verificado en el log de 26.2: en «Server thread», a veces con «[Not Secure]» delante.
const CHAT_RE = new RegExp(`^(?:\\[Not Secure\\] )?<(${NAME})> (.*)$`);
const START_RE = /^Done \([\d.,]+s\)! For help/;
const STOP_RE = /^Stopping (?:the )?server$/;
const FALLBACK_DEATH_RE = new RegExp(`^(${NAME}) (.+)$`);

const ADVANCEMENT_KINDS: Record<string, AdvancementKind> = {
  "made the advancement": "task",
  "completed the challenge": "challenge",
  "reached the goal": "goal",
};

/** Hora del log (solo HH:MM:SS) en la fecha de `now`; si queda en el futuro, era de ayer. */
export function logTimeToDate(now: Date, h: number, m: number, s: number): Date {
  const at = new Date(now);
  at.setHours(h, m, s, 0);
  if (at.getTime() - now.getTime() > 60_000) at.setDate(at.getDate() - 1);
  return at;
}

export class LogParser {
  /** Jugadores conectados según el propio log (para el detector de muertes de respaldo). */
  readonly online = new Set<string>();

  private auditParser: AuditParser | null = null;

  constructor(private readonly lang: Translator) {}

  /** Se crea al primer uso: para entonces los textos del jar ya están cargados. */
  private get audit(): AuditParser {
    this.auditParser ??= new AuditParser((key) => this.lang.englishText(key));
    return this.auditParser;
  }

  parse(line: string, now = new Date()): LogEvent | null {
    const m = LINE_RE.exec(line.trimEnd());
    if (!m) return null;
    const message = m[4] ?? "";
    const at = logTimeToDate(now, Number(m[1]), Number(m[2]), Number(m[3]));

    let r: RegExpExecArray | null;
    // El chat primero: lo que escribe un jugador nunca debe tomarse por otra cosa.
    if ((r = CHAT_RE.exec(message))) {
      return { type: "chat", at, player: r[1] ?? "", message: r[2] ?? "" };
    }
    // Acciones de administración (antes de descartar las líneas entre corchetes).
    const audit = this.audit.parse(message);
    if (audit) return { type: "admin", at, audit };
    // Otras líneas con «<», salida de comandos y líneas con IP: nunca.
    if (message.startsWith("<") || message.startsWith("[") || message.includes("[/")) return null;
    if ((r = JOIN_RE.exec(message))) {
      const player = r[1] ?? "";
      this.online.add(player);
      return { type: "join", at, player };
    }
    if ((r = LEAVE_RE.exec(message))) {
      const player = r[1] ?? "";
      this.online.delete(player);
      return { type: "leave", at, player };
    }
    if ((r = ADVANCEMENT_RE.exec(message))) {
      return {
        type: "advancement",
        at,
        player: r[1] ?? "",
        kind: ADVANCEMENT_KINDS[r[2] ?? ""] ?? "task",
        title: this.lang.fromEnglishAdvancementTitle(r[3] ?? ""),
        key: this.lang.advancementKeyFromEnglishTitle(r[3] ?? ""),
      };
    }
    if (START_RE.test(message)) {
      this.online.clear();
      return { type: "server_start", at };
    }
    if (STOP_RE.test(message)) {
      this.online.clear();
      return { type: "server_stop", at };
    }

    const death = this.lang.matchDeath(message);
    if (death) {
      return {
        type: "death",
        at,
        player: death.args[0] ?? "",
        english: message,
        spanish: this.lang.renderDeath(death),
        combat: death.combat,
        cause: { key: death.key, killer: death.combat ? (death.args[1] ?? null) : null },
      };
    }

    // Sin plantillas (no se pudo leer el jar): cualquier línea que empiece por
    // el nombre de un jugador conectado y no sea otra cosa se toma como muerte.
    if (!this.lang.hasDeathTemplates() && (r = FALLBACK_DEATH_RE.exec(message)) && this.online.has(r[1] ?? "")) {
      return {
        type: "death",
        at,
        player: r[1] ?? "",
        english: message,
        spanish: null,
        combat: / by /.test(r[2] ?? ""),
        cause: null,
      };
    }
    return null;
  }
}

// ------------------------------------------------------------- tailer

const MAX_READ_BYTES = 1024 * 1024;

/** Lee las líneas nuevas de un fichero que crece y rota. */
export class LogTailer {
  private offset = 0;
  private inode: number | null = null;
  private remainder = Buffer.alloc(0);
  private polling = false;

  constructor(
    private readonly file: string,
    private readonly onLine: (line: string, live: boolean) => void,
  ) {}

  /**
   * Primera lectura: entrega lo que ya hay como histórico (`live = false`) y
   * deja el cursor al final. Desde ahí, `poll()` entrega lo nuevo.
   */
  async start(): Promise<void> {
    await this.read(false);
  }

  async poll(): Promise<void> {
    await this.read(true);
  }

  private async read(live: boolean): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      let info;
      try {
        info = await stat(this.file);
      } catch {
        return; // En plena rotación puede no existir un instante.
      }
      if (this.inode !== null && (info.ino !== this.inode || info.size < this.offset)) {
        this.offset = 0;
        this.remainder = Buffer.alloc(0);
      }
      this.inode = info.ino;

      while (info.size > this.offset) {
        const length = Math.min(info.size - this.offset, MAX_READ_BYTES);
        const chunk = Buffer.alloc(length);
        const fh = await open(this.file, "r");
        try {
          await fh.read(chunk, 0, length, this.offset);
        } finally {
          await fh.close();
        }
        this.offset += length;
        this.consume(chunk, live);
      }
    } finally {
      this.polling = false;
    }
  }

  /** Corta solo en saltos de línea completos (no parte caracteres UTF-8). */
  private consume(chunk: Buffer, live: boolean): void {
    const data = Buffer.concat([this.remainder, chunk]);
    const lastNewline = data.lastIndexOf(0x0a);
    if (lastNewline === -1) {
      this.remainder = data;
      return;
    }
    this.remainder = data.subarray(lastNewline + 1);
    for (const line of data.subarray(0, lastNewline).toString("utf8").split("\n")) {
      this.onLine(line.replace(/\r$/, ""), live);
    }
  }
}

// ------------------------------------------------------------- servicio

export class LogWatcher {
  private timer: NodeJS.Timeout | null = null;
  private readonly parser: LogParser;
  private readonly tailer: LogTailer;

  constructor(
    dataDir: string,
    lang: Translator,
    /** `live = false` para el histórico leído al arrancar. */
    private readonly onEvent: (event: LogEvent, live: boolean) => void,
    private readonly intervalMs = 1000,
  ) {
    this.parser = new LogParser(lang);
    this.tailer = new LogTailer(path.join(dataDir, "logs", "latest.log"), (line, live) => {
      const event = this.parser.parse(line);
      if (event) this.onEvent(event, live);
    });
  }

  async start(): Promise<void> {
    await this.tailer.start();
    this.timer = setInterval(() => {
      this.tailer.poll().catch((error: unknown) => {
        log.warn(`Error leyendo el log: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
