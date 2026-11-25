import { PermissionFlagsBits, type Client, type SendableChannels } from "discord.js";
import { log } from "./log.js";

const PERMISSION_NAMES = {
  ViewChannel: "Ver canal",
  SendMessages: "Enviar mensajes",
  EmbedLinks: "Insertar enlaces",
  ReadMessageHistory: "Leer el historial de mensajes",
  AttachFiles: "Adjuntar archivos",
} as const;

export type ChannelPermission = keyof typeof PERMISSION_NAMES;

/**
 * Abre un canal en el que Skald tiene que escribir. Si no existe o no admite
 * mensajes devuelve null; si faltan permisos lo deja en el log (para que se
 * vea al arrancar, no cuando falle un aviso).
 */
export async function fetchSendableChannel(
  client: Client<true>,
  channelId: string,
  purpose: string,
  required: readonly ChannelPermission[] = ["ViewChannel", "SendMessages", "EmbedLinks"],
): Promise<SendableChannels | null> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isSendable()) {
    log.warn(`Canal de ${purpose} (${channelId}) no encontrado o no admite mensajes`);
    return null;
  }
  if (!channel.isDMBased()) {
    const perms = channel.permissionsFor(client.user);
    const missing = required.filter((p) => !perms?.has(PermissionFlagsBits[p])).map((p) => PERMISSION_NAMES[p]);
    if (missing.length > 0) log.warn(`Faltan permisos en el canal de ${purpose}: ${missing.join(", ")}`);
  }
  return channel;
}
