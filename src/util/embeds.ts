import { EmbedBuilder } from "discord.js";
import { texts } from "./texts.js";

export const COLORS = {
  /** Principal: ámbar de la luna. */
  main: 0xd65218,
  /** Éxito / en línea. */
  ok: 0xe67a22,
  /** Error / caído. */
  error: 0xa82814,
} as const;

export function baseEmbed(color: number = COLORS.main): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setFooter({ text: texts.footer }).setTimestamp();
}
