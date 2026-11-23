import type { Config } from "../config.js";

/**
 * ¿Se puede usar un comando en este canal? Si `COMMAND_CHANNEL_IDS` está vacío,
 * en todos. El canal de administración siempre (para pruebas). Un hilo cuenta
 * como su canal padre.
 */
export function isCommandChannelAllowed(
  config: Pick<Config, "COMMAND_CHANNEL_IDS" | "ADMIN_CHANNEL_ID">,
  channelId: string | null,
  parentId: string | null,
): boolean {
  if (config.COMMAND_CHANNEL_IDS.length === 0) return true;
  const allowed = new Set(config.COMMAND_CHANNEL_IDS);
  if (config.ADMIN_CHANNEL_ID) allowed.add(config.ADMIN_CHANNEL_ID);
  return (channelId !== null && allowed.has(channelId)) || (parentId !== null && allowed.has(parentId));
}
