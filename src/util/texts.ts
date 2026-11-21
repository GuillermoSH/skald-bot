/**
 * Todos los textos de Skald, el bardo del reino (temática nórdica).
 * Para cambiar el tono basta con tocar este fichero.
 */
import type { TickState } from "../core/parsers.js";

export const BOT_NAME = "Skald";

/** "1 guerrero", "3 guerreros". */
export function warriors(n: number): string {
  return `${n} ${n === 1 ? "guerrero" : "guerreros"}`;
}

export const texts = {
  footer: "Skald · cantor del reino",

  // /reino
  realmOnlineTitle: "🔥 El reino despierta",
  realmOnlineBody: (n: number) =>
    n === 0 ? "Las salas están vacías. Solo crepitan las brasas." : `${warriors(n)} en las salas.`,
  realmOfflineTitle: "🌑 Las brasas se apagaron",
  realmOfflineBody: "El reino no responde.",
  realmNoTicks: "_Los cuervos no traen noticias de la forja (RCON no responde)._",
  realmFields: {
    warriors: "Guerreros",
    tps: "TPS",
    mspt: "Tiempo por tick",
    latency: "Latencia",
    version: "Versión",
  },
  tickState: {
    normal: null,
    lagging: "⚠️ La forja no da abasto: el servidor va por detrás.",
    frozen: "🧊 El tiempo está congelado, como en Niflheim (`/tick freeze`).",
    sprinting: "🏃 Los dioses aceleran el tiempo (`/tick sprint`).",
  } satisfies Record<TickState, string | null>,
  loadVerdict: (load: number): string => {
    if (load < 0.5) return "Los fuegos del salón arden tranquilos.";
    if (load < 0.9) return "La forja trabaja duro, pero aguanta.";
    if (load <= 1) return "La forja está al límite.";
    return "¡El reino se tambalea! Hay lag.";
  },

  // /guerreros
  warriorsTitle: (online: number, max: number) => `⚔️ Guerreros en el reino (${online}/${max})`,
  warriorsEmpty: "Nadie en las salas. Solo se oye el viento del norte.",

  // /runas
  runesTitle: "ᚱ Las runas del reino",
  runesFields: {
    version: "Versión",
    loader: "Cargador",
    protocol: "Protocolo",
    dataVersion: "Versión de datos",
    packs: "Formato de packs (recursos / datos)",
    build: "Compilado",
  },
  runesNoRcon: "_Las runas más hondas no se dejan leer (RCON no responde o el servidor no es vanilla)._",

  // /mapa
  mapTitle: "🗺️ El mapa del reino",
  mapBody: "Ábrelo desde la red del reino (LAN o VPN).",
  mapButton: "Abrir el mapa",
  mapMissing: "El mapa del reino aún no está trazado.",

  // /ayuda
  helpTitle: "📜 Lo que sabe cantar Skald",

  // Errores
  ravensSilent: "🐦‍⬛ Los cuervos no traen noticias. Inténtalo de nuevo.",
  parseError:
    "📜 Las runas que devuelve el servidor no se dejan leer. Seguramente ha cambiado de versión; queda anotado.",
  wrongGuild: "Skald solo canta en su propio salón.",

  // Presencia (lo que se ve bajo el nombre del bot)
  presence: {
    starting: "las brasas del reino",
    withPlayers: (n: number) => `a ${warriors(n)} en el reino`,
    empty: "el silencio de las salas",
    offline: "El reino duerme (offline)",
  },
} as const;
