import { ActivityType, type ActivitiesOptions, type Client, type PresenceData } from "discord.js";
import type { Config } from "./config.js";
import { getServerStatus, type ServerStatus } from "./core/status.js";
import { log } from "./util/log.js";
import { texts } from "./util/texts.js";

const INTERVAL_MS = 60_000;

/**
 * Estado personalizado: Discord muestra `state` tal cual, igual en el perfil
 * que en la lista de miembros. `name` es obligatorio pero no se ve.
 */
function customStatus(text: string): ActivitiesOptions {
  return { type: ActivityType.Custom, name: "Custom Status", state: text };
}

/** Presencia al arrancar, antes del primer ping. */
export const STARTING_PRESENCE: PresenceData = {
  status: "online",
  activities: [customStatus(texts.presence.starting)],
};

/** Elige la presencia según el estado del servidor (función pura, se prueba sola). */
export function choosePresence(status: ServerStatus): PresenceData {
  if (!status.online) return { status: "dnd", activities: [customStatus(texts.presence.offline)] };
  if (status.playersOnline === 0) return { status: "idle", activities: [customStatus(texts.presence.empty)] };
  return { status: "online", activities: [customStatus(texts.presence.withPlayers(status.playersOnline))] };
}

/**
 * Cada minuto hace ping al servidor y actualiza la presencia, solo si ha
 * cambiado (Discord limita los cambios de presencia). Devuelve la función
 * para pararlo.
 */
export function startPresenceLoop(client: Client<true>, config: Config): () => void {
  let last = JSON.stringify(STARTING_PRESENCE);

  const update = async () => {
    const status = await getServerStatus(config.MC_HOST, config.MC_PORT, config.RCON_TIMEOUT_MS);
    const presence = choosePresence(status);
    const key = JSON.stringify(presence);
    if (key === last) return;
    client.user.setPresence(presence);
    last = key;
    log.debug(`Presencia: ${presence.status ?? "?"} · ${presence.activities?.[0]?.state ?? ""}`);
  };

  const run = () => {
    update().catch((error: unknown) => {
      log.warn(`No se pudo actualizar la presencia: ${error instanceof Error ? error.message : String(error)}`);
    });
  };

  run();
  const timer = setInterval(run, INTERVAL_MS);
  return () => { clearInterval(timer); };
}
