import { Rcon } from "rcon-client";
import { parseList, parseTickQuery, parseVersion, type PlayerList, type TickInfo, type VersionInfo } from "./parsers.js";

/**
 * LISTA CERRADA de comandos RCON que el bot puede enviar.
 *
 * Es un tipo literal y `send` no se exporta: no hay forma de mandar un texto
 * arbitrario (por ejemplo, algo escrito en Discord) al servidor. Para añadir
 * un comando hay que añadirlo aquí y escribir su función.
 *
 * Las excepciones son dos plantillas cerradas: `tellraw` (`buildTellraw`) y
 * `playsound` (`buildPlaysound`, solo sonidos de GAME_SOUNDS y a un jugador). En `tellraw`:
 * el destino es `@a` o un nombre válido, y el texto va siempre dentro de un
 * componente JSON generado con JSON.stringify (el servidor rechaza cualquier
 * cosa que vaya detrás, así que no se puede colar otro comando).
 */
const ALLOWED_COMMANDS = ["list", "tick query", "version"] as const;
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
function cleanText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f§]/g, " ");
}

/** Construye el comando `tellraw` (lanza si el destino no es válido). */
export function buildTellraw(target: string, parts: readonly TextPart[]): string {
  if (target !== "@a" && !PLAYER_RE.test(target)) throw new Error("Destino de tellraw no válido");
  let budget = 600; // caracteres de texto como mucho
  const components = parts.map((p) => {
    if ("br" in p) return { text: "\n" };
    if ("head" in p) {
      if (!PLAYER_RE.test(p.head)) throw new Error("Nombre de jugador no válido");
      return { object: "player", player: { name: p.head }, hat: true };
    }
    const text = cleanText(p.text).slice(0, Math.max(0, budget));
    budget -= text.length;
    return {
      text,
      ...(p.color ? { color: p.color } : {}),
      ...(p.bold ? { bold: true } : {}),
      ...(p.italic ? { italic: true } : {}),
      ...(p.hover ? { hover_event: { action: "show_text", value: cleanText(p.hover).slice(0, 200) } } : {}),
      ...(p.url && /^https:\/\/[^\s"]+$/.test(p.url) ? { click_event: { action: "open_url", url: p.url } } : {}),
      ...(!p.url && p.suggest && /^![a-z]{1,20}$/.test(p.suggest) ? { click_event: { action: "suggest_command", command: p.suggest } } : {}),
    };
  });
  const command = `tellraw ${target} ${JSON.stringify(["", ...components])}`;
  if (Buffer.byteLength(command, "utf8") > MAX_COMMAND_BYTES) throw new Error("Mensaje de tellraw demasiado largo");
  return command;
}

// ---- playsound (plantilla cerrada: sonidos de una lista fija, a un jugador)

export const GAME_SOUNDS = {
  /** Cuerno de cabra: el saludo al entrar. */
  horn: { id: "minecraft:item.goat_horn.sound.0", volume: 0.5, pitch: 1 },
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

  /** Sonido para un jugador, con la plantilla cerrada. */
  async playSound(target: string, sound: GameSound): Promise<void> {
    await this.exec([buildPlaysound(target, sound)]);
  }

  /** Mensaje en el chat del juego (a todos o a un jugador), con la plantilla cerrada. */
  async tellraw(target: "@a" | (string & {}), parts: readonly TextPart[]): Promise<void> {
    await this.exec([buildTellraw(target, parts)]);
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

  /** Solo la llaman `send` (lista cerrada), `tellraw` y `playSound` (plantillas cerradas). */
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
