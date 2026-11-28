import { Rcon } from "rcon-client";
import { parseList, parseTickQuery, parseTimeQuery, parseVersion, type PlayerList, type TickInfo, type VersionInfo } from "./parsers.js";

/**
 * LISTA CERRADA de comandos RCON que el bot puede enviar.
 *
 * Es un tipo literal y `send` no se exporta: no hay forma de mandar un texto
 * arbitrario (por ejemplo, algo escrito en Discord) al servidor. Para añadir
 * un comando hay que añadirlo aquí y escribir su función.
 *
 * Las excepciones son plantillas cerradas: `tellraw` (`buildTellraw`),
 * `playsound` (`buildPlaysound`, solo sonidos de GAME_SOUNDS y a un jugador), `give`
 * (`buildGive`) y `scoreboard players list <jugador>` (`buildScoresQuery`, solo lectura). En `tellraw`:
 * el destino es `@a` o un nombre válido, y el texto va siempre dentro de un
 * componente JSON generado con JSON.stringify (el servidor rechaza cualquier
 * cosa que vaya detrás, así que no se puede colar otro comando). Se escribe en SNBT compacto
 * (`toSnbt`): campos sin comillas y textos con las comillas y escapes de JSON.
 */
const ALLOWED_COMMANDS = ["list", "tick query", "version", "time query time"] as const;
type AllowedCommand = (typeof ALLOWED_COMMANDS)[number];

// ---- tellraw (plantilla cerrada)

export type TextColor = "gold" | "yellow" | "gray" | "dark_gray" | "white" | "red" | "green" | "aqua";

/** Un trozo de texto, la cabeza de un jugador o un salto de línea (estos dos, solo los pone Skald). */
export type TextPart = TextSpan | { head: string } | { br: true };

export interface TextSpan {
  text: string;
  color?: TextColor;
  bold?: boolean;
  italic?: boolean;
  /** Texto al pasar el ratón. */
  hover?: string;
  /** Enlace al hacer clic (solo https). */
  url?: string;
  /** Al hacer clic, deja este comando de Skald («!…») escrito en el chat. */
  suggest?: string;
}

const PLAYER_RE = /^[A-Za-z0-9_]{3,16}$/;
/** RCON admite paquetes de ~1446 bytes; con margen. */
const MAX_COMMAND_BYTES = 1300;

/** Sin caracteres de control ni códigos de formato de Minecraft (§). */
function cleanText(text: string, keepNewlines = false): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = text.replace(keepNewlines ? /[\u0000-\u0009\u000b-\u001f\u007f§]/g : /[\u0000-\u001f\u007f§]/g, " ");
  return cleaned;
}

/**
 * Serializa un componente en SNBT compacto: los nombres de campo (siempre nuestros, de
 * letras y guiones bajos) sin comillas, y los textos con JSON.stringify (comillas y
 * escapes válidos también en SNBT). Ocupa menos que JSON y la 26.2 lo acepta igual.
 */
export function toSnbt(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return `[${value.map(toSnbt).join(",")}]`;
  if (value && typeof value === "object") {
    const fields = Object.entries(value).map(([k, v]) => {
      if (!/^[a-z_]+$/.test(k)) throw new Error(`Campo no válido en tellraw: ${k}`);
      return `${k}:${toSnbt(v)}`;
    });
    return `{${fields.join(",")}}`;
  }
  throw new Error("Valor no válido en tellraw");
}

function headComponent(name: string): Record<string, unknown> {
  if (!PLAYER_RE.test(name)) throw new Error("Nombre de jugador no válido");
  return { object: "player", player: { name }, hat: true };
}

/** Construye el comando `tellraw` (lanza si el destino no es válido). */
export function buildTellraw(target: string, parts: readonly TextPart[], base?: TextColor): string {
  if (target !== "@a" && !PLAYER_RE.test(target)) throw new Error("Destino de tellraw no válido");
  let budget = 600; // caracteres de texto como mucho
  // Un salto de línea seguido de texto va en el mismo componente (ocupa menos).
  const state = { pendingBreak: false };
  const components: Record<string, unknown>[] = parts.flatMap((p) => {
    if ("br" in p) {
      if (state.pendingBreak) return [{ text: "\n" }];
      state.pendingBreak = true;
      return [];
    }
    const lead = state.pendingBreak ? "\n" : "";
    state.pendingBreak = false;
    if ("head" in p && lead) return [{ text: lead }, headComponent(p.head)];
    if ("head" in p) return [headComponent(p.head)];
    const text = cleanText(p.text).slice(0, Math.max(0, budget));
    budget -= text.length;
    return [{
      text: lead + text,
      // El color del mensaje lo heredan los trozos que no dicen otro (ocupa menos).
      ...(p.color && p.color !== base ? { color: p.color } : {}),
      ...(p.bold ? { bold: true } : {}),
      ...(p.italic ? { italic: true } : {}),
      // En el texto emergente sí se permiten saltos de línea (lo escribe Skald, no un jugador).
      ...(p.hover ? { hover_event: { action: "show_text", value: cleanText(p.hover, true).slice(0, 200) } } : {}),
      ...(p.url && /^https:\/\/[^\s"]+$/.test(p.url) ? { click_event: { action: "open_url", url: p.url } } : {}),
      ...(!p.url && p.suggest && /^![a-z]{1,20} ?$/.test(p.suggest) ? { click_event: { action: "suggest_command", command: p.suggest } } : {}),
    }];
  });
  if (state.pendingBreak) components.push({ text: "\n" });
  const root = base ? { text: "", color: base } : "";
  const command = `tellraw ${target} ${toSnbt([root, ...components])}`;
  if (Buffer.byteLength(command, "utf8") > MAX_COMMAND_BYTES) throw new Error("Mensaje de tellraw demasiado largo");
  return command;
}

// ---- playsound (plantilla cerrada: sonidos de una lista fija, a un jugador)

export const GAME_SOUNDS = {
  /** Cuerno de cabra: el saludo al entrar. */
  horn: { id: "minecraft:item.goat_horn.sound.0", volume: 0.5, pitch: 1 },
  /** Premio gordo en la ruleta. */
  levelup: { id: "minecraft:entity.player.levelup", volume: 0.7, pitch: 1 },
} as const;
export type GameSound = keyof typeof GAME_SOUNDS;

/**
 * `playsound` desde la consola: la posición es la del servidor, así que se usa el
 * volumen mínimo para que lo oiga el jugador esté donde esté (y solo él).
 */
export function buildPlaysound(target: string, sound: GameSound): string {
  if (!PLAYER_RE.test(target)) throw new Error("Destino de playsound no válido");
  const s = GAME_SOUNDS[sound];
  return `playsound ${s.id} master ${target} ~ ~ ~ ${s.volume} ${s.pitch} ${s.volume}`;
}

// ---- give (plantilla cerrada: objetos y encantamientos de las tablas de la ruleta)

const ITEM_ID_RE = /^minecraft:[a-z0-9_]{1,40}$/;
const ENCHANT_ID_RE = /^[a-z_]{1,40}$/;

/** `give <jugador> <objeto>[encantamientos] <n>`: solo ids de minecraft, 1-64 unidades. */
export function buildGive(target: string, item: string, count: number, enchantments: readonly { id: string; level: number }[] = []): string {
  if (!PLAYER_RE.test(target)) throw new Error("Destino de give no válido");
  if (!ITEM_ID_RE.test(item)) throw new Error("Objeto de give no válido");
  if (!Number.isInteger(count) || count < 1 || count > 64) throw new Error("Cantidad de give no válida");
  let components = "";
  if (enchantments.length > 0) {
    const map = enchantments.map((e) => {
      if (!ENCHANT_ID_RE.test(e.id) || !Number.isInteger(e.level) || e.level < 1 || e.level > 10) throw new Error("Encantamiento no válido");
      return `"minecraft:${e.id}":${e.level}`;
    });
    components = `[minecraft:stored_enchantments={${map.join(",")}}]`;
  }
  return `give ${target} ${item}${components} ${count}`;
}

// ---- scoreboard players list (plantilla cerrada, solo lectura)

/** `scoreboard players list <jugador>`: los marcadores de un jugador (no cambia nada). */
export function buildScoresQuery(target: string): string {
  if (!PLAYER_RE.test(target)) throw new Error("Jugador de scoreboard no válido");
  return `scoreboard players list ${target}`;
}

export interface RconSettings {
  host: string;
  port: number;
  password: string;
  timeoutMs: number;
}

/** El servidor no responde por RCON (apagado, reiniciando, contraseña mala...). */
export class RconUnavailableError extends Error {
  override name = "RconUnavailableError";
}

export class RconClient {
  constructor(private readonly settings: RconSettings) {}

  async listPlayers(): Promise<PlayerList> {
    const [list] = await this.send(["list"]);
    return parseList(list);
  }

  async queryTick(): Promise<TickInfo> {
    const [tick] = await this.send(["tick query"]);
    return parseTickQuery(tick);
  }

  async queryVersion(): Promise<VersionInfo> {
    const [version] = await this.send(["version"]);
    return parseVersion(version);
  }

  /** Reloj del overworld (ticks totales; tick 0 = 6:00 del día 1). */
  async queryTime(): Promise<number> {
    const [time] = await this.send(["time query time"]);
    return parseTimeQuery(time);
  }

  /** Entrega un objeto con la plantilla cerrada; devuelve la respuesta del servidor. */
  async give(target: string, item: string, count: number, enchantments: readonly { id: string; level: number }[] = []): Promise<string> {
    const [response] = await this.exec([buildGive(target, item, count, enchantments)]);
    return response ?? "";
  }

  /** Respuesta de `scoreboard players list` de cada jugador, en una sola conexión. */
  async playerScores(targets: readonly string[]): Promise<Map<string, string>> {
    if (targets.length === 0) return new Map();
    const responses = await this.exec(targets.map(buildScoresQuery));
    return new Map(targets.map((name, i) => [name, responses[i] ?? ""]));
  }

  /** Sonido para un jugador, con la plantilla cerrada. */
  async playSound(target: string, sound: GameSound): Promise<void> {
    await this.exec([buildPlaysound(target, sound)]);
  }

  /** Mensaje en el chat del juego (a todos o a un jugador), con la plantilla cerrada. */
  async tellraw(target: "@a" | (string & {}), parts: readonly TextPart[], base?: TextColor): Promise<void> {
    await this.exec([buildTellraw(target, parts, base)]);
  }

  /**
   * Abre una conexión, envía los comandos en orden y la cierra. Una conexión
   * por petición: más simple y aguanta reinicios del servidor sin estado raro.
   */
  private async send<const C extends readonly AllowedCommand[]>(
    commands: C,
  ): Promise<{ [K in keyof C]: string }> {
    for (const command of commands) {
      // Defensa extra por si alguien fuerza el tipo con `as`.
      if (!(ALLOWED_COMMANDS as readonly string[]).includes(command)) {
        throw new Error(`Comando RCON no permitido: ${command}`);
      }
    }
    return (await this.exec(commands)) as { [K in keyof C]: string };
  }

  /** Solo la llaman `send` (lista cerrada), `tellraw`, `playSound`, `give` y `playerScores` (plantillas cerradas). */
  private async exec(commands: readonly string[]): Promise<string[]> {
    const { host, port, password, timeoutMs } = this.settings;
    let rcon: Rcon;
    try {
      rcon = await withTimeout(Rcon.connect({ host, port, password, timeout: timeoutMs }), timeoutMs);
    } catch (error) {
      throw new RconUnavailableError(`No se pudo conectar por RCON a ${host}:${port}`, { cause: error });
    }

    try {
      const responses: string[] = [];
      for (const command of commands) {
        responses.push(await withTimeout(rcon.send(command), timeoutMs));
      }
      return responses;
    } catch (error) {
      throw new RconUnavailableError("El servidor dejó de responder por RCON", { cause: error });
    } finally {
      rcon.end().catch(() => undefined);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new Error(`Tiempo de espera agotado (${ms} ms)`)); }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => { clearTimeout(timer); });
}
