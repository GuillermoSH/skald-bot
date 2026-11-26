/** Mensajes de Skald en el chat del juego (con el formato de la plantilla de tellraw). */
import type { TextPart } from "../core/rcon.js";
import { texts } from "./texts.js";

/** "[Skald] texto", con enlace opcional (clic) al final. */
export function gameLine(text: string, url?: string): TextPart[] {
  const parts: TextPart[] = [
    { text: texts.game.prefix, color: "gold", bold: true },
    { text, color: "yellow" },
  ];
  if (url) parts.push({ text: ` ${texts.game.link}`, color: "aqua", url, hover: url });
  return parts;
}

/** Respuesta privada (más discreta). */
export function gameReply(text: string): TextPart[] {
  return [
    { text: texts.game.prefix, color: "gold", bold: true },
    { text, color: "gray" },
  ];
}

/** "mié 24 dic, 21:30" en la zona horaria del reino. */
export function gameDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}
