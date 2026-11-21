import { Rcon } from "rcon-client";
import { parseList, parseTickQuery, parseVersion, type PlayerList, type TickInfo, type VersionInfo } from "./parsers.js";

/**
 * LISTA CERRADA de comandos RCON que el bot puede enviar.
 *
 * Es un tipo literal y `send` no se exporta: no hay forma de mandar un texto
 * arbitrario (por ejemplo, algo escrito en Discord) al servidor. Para añadir
 * un comando hay que añadirlo aquí y escribir su función.
 */
const ALLOWED_COMMANDS = ["list", "tick query", "version"] as const;
type AllowedCommand = (typeof ALLOWED_COMMANDS)[number];

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
      return responses as { [K in keyof C]: string };
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
