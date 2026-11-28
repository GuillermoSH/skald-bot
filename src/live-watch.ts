/**
 * Misiones en vivo: cada 20 s, si hay alguien conectado, Skald lee por RCON los
 * marcadores de los conectados (`scoreboard players list`, solo lectura), los apunta
 * en `LiveStats` y revisa sus misiones del día, así que una misión se cumple a los
 * pocos segundos y no al siguiente autoguardado. Sin marcadores en el servidor no
 * cambia nada (solo cuentan los ficheros).
 */
import { announceTaskEvents } from "./commands/tareas.js";
import type { CommandContext } from "./commands/types.js";
import { parseScores } from "./core/live.js";
import { log } from "./util/log.js";

const CHECK_MS = 20_000;

export function startLiveWatch(ctx: CommandContext): () => void {
  let busy = false;
  let failing = false;
  const check = async () => {
    const tasks = ctx.realm.tasks;
    const liveStats = ctx.realm.liveStats;
    if (busy || !tasks || !liveStats) return;
    busy = true;
    try {
      const { names: online } = await ctx.rcon.listPlayers();
      if (online.length === 0) {
        liveStats.clear();
        return;
      }
      // Primero los ficheros y luego los marcadores: así nunca se cuenta nada dos veces.
      const players = await ctx.world.players();
      const names = await ctx.names.resolve(players.map((p) => p.uuid));
      const onlineSet = new Set(online.map((n) => n.toLowerCase()));
      const here = players.flatMap((p) => {
        const name = names.get(p.uuid);
        return name && onlineSet.has(name.toLowerCase()) ? [{ record: p, name }] : [];
      });
      const scores = await ctx.rcon.playerScores(here.map((h) => h.name));
      const hereIds = new Set(here.map((h) => h.record.uuid));
      liveStats.keepOnly(hereIds);
      for (const h of here) liveStats.update(h.record.uuid, h.record.savedAt, parseScores(scores.get(h.name) ?? ""));
      await announceTaskEvents(ctx, tasks.tick(here.map((h) => h.record)));
      if (failing) log.info("Misiones en vivo: de nuevo en marcha");
      failing = false;
    } catch (error) {
      if (!failing) log.debug(`Misiones en vivo sin datos: ${error instanceof Error ? error.message : String(error)}`);
      failing = true;
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void check(), CHECK_MS);
  return () => {
    clearInterval(timer);
  };
}
