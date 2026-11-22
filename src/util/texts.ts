/**
 * Todos los textos de Skald, el bardo del reino (temática nórdica).
 * Para cambiar el tono basta con tocar este fichero.
 */
import type { AdvancementKind } from "../core/logwatch.js";
import type { MetricId } from "../core/metrics.js";
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

  // /gestas
  gestas: {
    optionName: "categoria",
    optionDescription: "Qué gesta quieres escuchar",
    empty: "Nadie ha protagonizado aún esta gesta.",
    note: "-# Según el último guardado del mundo (cada ~5 min).",
    medals: ["🥇", "🥈", "🥉", "4.", "5."],
    categories: {
      play_time: { emoji: "⏳", label: "Tiempo en el reino" },
      deaths: { emoji: "💀", label: "Muertes" },
      mob_kills: { emoji: "⚔️", label: "Mobs abatidos" },
      blocks_mined: { emoji: "⛏️", label: "Bloques picados" },
      advancements: { emoji: "🏆", label: "Logros" },
      distance: { emoji: "🧭", label: "Distancia recorrida" },
      creeper_deaths: { emoji: "💥", label: "Pasto de creepers", hint: "Veces que un creeper los mandó al Valhalla." },
      silly_deaths: { emoji: "🤡", label: "Muertes tontas", hint: "Muertes sin un mob de por medio: caídas, lava, ahogamientos…" },
      elytra: { emoji: "🪽", label: "Ícaro", hint: "Distancia volada con élitros." },
      chickens: { emoji: "🐔", label: "Verdugo de pollos", hint: "Pollos que no volverán a cacarear." },
      sleep: { emoji: "🛏️", label: "Dormilón", hint: "Veces que se han ido a la cama." },
      jumps: { emoji: "🐸", label: "Saltarín", hint: "Saltos. Muchos saltos." },
      survivor: { emoji: "🛡️", label: "Superviviente", hint: "Tiempo de juego desde su última muerte." },
      rage_quit: { emoji: "🚪", label: "Rage quit", hint: "Veces que han salido del reino." },
      eggs: { emoji: "🥚", label: "Lanzahuevos", hint: "Huevos lanzados (¿a quién?)." },
      logs: { emoji: "🪓", label: "Leñador", hint: "Troncos talados." },
      diamonds: { emoji: "💎", label: "Cazadiamantes", hint: "Menas de diamante picadas." },
      broken_tools: { emoji: "🔨", label: "Manazas", hint: "Herramientas rotas de tanto darles." },
      player_kills: { emoji: "🗡️", label: "Traidor del clan", hint: "Guerreros caídos a sus manos." },
      fish: { emoji: "🎣", label: "Pescador", hint: "Peces sacados del agua." },
      trades: { emoji: "🤝", label: "Usurero", hint: "Tratos cerrados con aldeanos." },
      breeding: { emoji: "🐄", label: "Granjero", hint: "Animales criados." },
      swim: { emoji: "🧜", label: "Sirena", hint: "Distancia nadando o caminando bajo el agua." },
      bells: { emoji: "🔔", label: "Campanero", hint: "Campanas tocadas. Dong." },
    } satisfies Record<MetricId, { emoji: string; label: string; hint?: string }>,
  },

  // /cronica
  cronica: {
    optionName: "guerrero",
    optionDescription: "Nombre del guerrero en Minecraft",
    title: (name: string) => `📜 Crónica de ${name}`,
    playTime: "⏳ Tiempo en el reino",
    deaths: "💀 Muertes",
    killer: (entity: string, n: string) => `Su verdugo: ${entity} (${n})`,
    sinceDeath: "🛡️ Sin morir",
    mobKills: "⚔️ Mobs abatidos",
    prey: (entity: string, n: string) => `Su presa favorita: ${entity} (${n})`,
    mined: "⛏️ Bloques picados",
    favouriteBlock: (block: string) => `Su favorito: ${block}`,
    distance: "🧭 Distancia",
    advancements: (n: number) => `🏆 Logros (${n})`,
    noAdvancements: "Aún ninguno. Todo héroe empieza en algún sitio.",
    unknown: (name: string) => `Skald no conoce a ningún guerrero llamado **${name}**.`,
    invalidName: "Ese no parece un nombre de guerrero de Minecraft.",
  },

  // Avisos en el canal (#cuervos). {p} ya viene escapado y en negrita.
  alerts: {
    join: (p: string) => `🟢 ${p} ha entrado en el reino.`,
    leave: (p: string) => `🔴 ${p} ha abandonado el reino.`,
    serverStart: "🔥 El reino despierta.",
    serverStop: "🌑 El reino se apaga.",
    // Muerte en combate: al Valhalla con las valquirias.
    valhalla: [
      (p: string) => `Las valquirias se han llevado a ${p} al Valhalla.`,
      (p: string) => `${p} ha caído en combate. Esta noche cena en el Valhalla.`,
      (p: string) => `Odín abre las puertas de su salón a ${p}.`,
      (p: string) => `Las valquirias bajan del cielo: ${p} ha caído luchando.`,
    ],
    // Muerte sin gloria (caídas, lava, ahogado...): se lo lleva Hel.
    hel: [
      (p: string) => `Hel reclama el alma de ${p}. Sin gloria no hay Valhalla.`,
      (p: string) => `${p} ha muerto sin espada en la mano. Hel se lo lleva.`,
      (p: string) => `Ninguna valquiria vino a por ${p}: hoy duerme en Helheim.`,
    ],
    advancement: {
      task: (p: string, t: string) => `🏆 ${p} ha conseguido el logro **[${t}]**.`,
      challenge: (p: string, t: string) => `🎖️ ${p} ha completado el desafío **[${t}]**.`,
      goal: (p: string, t: string) => `🎯 ${p} ha alcanzado la meta **[${t}]**.`,
    } satisfies Record<AdvancementKind, (p: string, t: string) => string>,
    dropped: (n: number) => `-# …y ${n} avisos más que los cuervos no pudieron cargar.`,
  },

  // /saga
  saga: {
    title: "📖 La saga del reino",
    empty: "Las crónicas de hoy siguen en blanco. Nadie ha muerto ni ha logrado nada… aún.",
    note: "-# Hazañas y caídas del registro de hoy.",
    deathEmoji: { combat: "⚔️", hel: "🪦" },
    advancementEmoji: { task: "🏆", challenge: "🎖️", goal: "🎯" } satisfies Record<AdvancementKind, string>,
  },

  /** Cuando no se sabe el nombre de un UUID. */
  unknownWarrior: (uuid: string) => `Guerrero ${uuid.slice(0, 8)}`,

  // Errores
  ravensSilent: "🐦‍⬛ Los cuervos no traen noticias. Inténtalo de nuevo.",
  parseError:
    "📜 Las runas que devuelve el servidor no se dejan leer. Seguramente ha cambiado de versión; queda anotado.",
  wrongGuild: "Skald solo canta en su propio salón.",
  worldUnavailable: "📜 No encuentro las crónicas del mundo: no puedo leer los ficheros del servidor.",

  // Presencia: estado personalizado, se lee tal cual bajo el nombre del bot
  // (sin «Viendo» / «Escuchando» delante), así que cada texto va completo.
  presence: {
    starting: "🔥 Vigilando las brasas del reino",
    withPlayers: (n: number) => `⚔️ ${warriors(n)} en el reino`,
    empty: "🌙 Silencio en las salas",
    offline: "💤 El reino duerme (offline)",
  },
} as const;
