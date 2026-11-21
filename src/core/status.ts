import { status } from "minecraft-server-util";

export type ServerStatus =
  | {
      online: true;
      version: string;
      protocol: number;
      playersOnline: number;
      playersMax: number;
      /** Muestra de nombres que da el ping (puede venir vacía aunque haya gente). */
      playerSample: string[];
      /** MOTD sin códigos de color. */
      motd: string;
      latencyMs: number;
    }
  | { online: false };

/**
 * Ping de estado (Server List Ping), el mismo que hace el cliente en la lista
 * de servidores. No necesita RCON ni contraseña.
 */
export async function getServerStatus(host: string, port: number, timeoutMs: number): Promise<ServerStatus> {
  try {
    const result = await status(host, port, { timeout: timeoutMs, enableSRV: false });
    return {
      online: true,
      version: result.version.name,
      protocol: result.version.protocol,
      playersOnline: result.players.online,
      playersMax: result.players.max,
      playerSample: (result.players.sample ?? []).map((p) => p.name),
      motd: result.motd.clean.trim(),
      latencyMs: result.roundTripLatency,
    };
  } catch {
    return { online: false };
  }
}
