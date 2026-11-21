/**
 * Prueba de humo SIN Discord: lanza ping y los comandos RCON de la lista
 * cerrada contra un servidor y enseña lo que entiende el bot.
 *
 * Por defecto apunta al servidor desechable de test/local-server:
 *   docker compose -f test/local-server/compose.yaml up -d
 *   pnpm smoke
 */
import { RconClient } from "../src/core/rcon.js";
import { getServerStatus } from "../src/core/status.js";

const host = process.env.SMOKE_HOST ?? "127.0.0.1";
const rcon = new RconClient({
  host,
  port: Number(process.env.SMOKE_RCON_PORT ?? 25575),
  password: process.env.LOCAL_RCON_PASSWORD ?? "skald-local",
  timeoutMs: 3000,
});

console.log("estado      ", await getServerStatus(host, Number(process.env.SMOKE_MC_PORT ?? 25565), 3000));
console.log("jugadores   ", await rcon.listPlayers());
console.log("tick        ", await rcon.queryTick());
console.log("version     ", await rcon.queryVersion());
