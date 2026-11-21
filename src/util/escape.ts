import { escapeMarkdown } from "discord.js";

const ZERO_WIDTH_SPACE = "​";

/**
 * Prepara texto que viene de fuera (nombres de jugador, MOTD...) para meterlo
 * en un mensaje de Discord: escapa el markdown y desactiva menciones
 * (@everyone, @here, <@id>). Además, todas las respuestas del bot se envían
 * con `allowedMentions: { parse: [] }`, que es la protección de verdad.
 */
export function safeText(input: string, maxLength = 256): string {
  const clean = input
    // Caracteres de control (salvo salto de línea) fuera. Es justo lo que se busca.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .replace(/@/g, `@${ZERO_WIDTH_SPACE}`);
  const escaped = escapeMarkdown(clean);
  return escaped.length > maxLength ? `${escaped.slice(0, maxLength - 1)}…` : escaped;
}

/** Nombre de jugador de Java válido: 3-16 caracteres [A-Za-z0-9_]. */
export const PLAYER_NAME = /^[A-Za-z0-9_]{3,16}$/;

export function isValidPlayerName(name: string): boolean {
  return PLAYER_NAME.test(name);
}
