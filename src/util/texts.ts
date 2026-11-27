/**
 * Todos los textos de Skald, el bardo del reino (temática nórdica).
 * Para cambiar el tono basta con tocar este fichero.
 */
import type { AdvancementKind } from "../core/logwatch.js";
import type { BackupStatus } from "../core/backups.js";
import type { DayPeriod } from "../core/sky.js";
import type { TaskTier } from "../core/tasks.js";
import type { LootGroupId } from "../core/loot.js";
import type { EarnCategory } from "../core/economy.js";
import type { MetricId } from "../core/metrics.js";
import type { MilestoneId } from "../core/milestones.js";
import type { TickState } from "../core/parsers.js";

export const BOT_NAME = "Skald";

/** 1 → I, 4 → IV, 12 → XII (para los nombres de las eras). */
export function roman(n: number): string {
  const table: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let rest = Math.max(1, Math.floor(n));
  let out = "";
  for (const [value, symbol] of table) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

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
    mods: "Mods",
  },
  runesMods: (n: number) => `${n} (solo de servidor)`,
  runesNoMods: "Ninguno",
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

  // Tareas diarias (/tareas y !tareas). {n} = objetivo.
  tareas: {
    title: "📋 Tus misiones del día",
    rerollOption: "cambiar",
    rerollOptionDescription: "Cambia una misión (1, 2 o 3) por otra de la misma dificultad: 20 monedas, una vez al día",
    rerolled: (old: string, task: string) => `🔄 Cambiada: ~~${old}~~ → **${task}** (−20 monedas).`,
    rerollFail: {
      bad_slot: "Elige la misión 1, 2 o 3.",
      done: "Esa ya la has cumplido.",
      used: "Ya has cambiado una misión hoy.",
      poor: "No te alcanza: cambiar una misión cuesta 20 monedas.",
      none: "No hay otra misión de esa dificultad para ti ahora mismo.",
      economy_off: "Sin economía no se pueden cambiar misiones.",
    } satisfies Record<string, string>,
    rerollHint: "-# ¿No te gusta una? `/tareas cambiar:2` la cambia por 20 monedas (una vez al día).",
    weeklyHeading: "### 🛡️ Misión del reino (esta semana)",
    weeklyNames: {
      kill_mobs: (n: string) => `El reino abate ${n} enemigos`,
      mine_blocks: (n: string) => `El reino pica ${n} bloques`,
      travel: (n: string) => `El reino recorre ${n} km`,
      fish: (n: string) => `El reino pesca ${n} peces`,
      trade: (n: string) => `El reino cierra ${n} tratos con aldeanos`,
      chop_logs: (n: string) => `El reino tala ${n} troncos`,
      kill_blazes: (n: string) => `El reino abate ${n} blazes`,
      mine_quartz: (n: string) => `El reino pica ${n} menas de cuarzo`,
    } as Record<string, (n: string) => string>,
    weeklyProgress: (bar: string, now: string, target: string) => `${bar} ${now} / ${target}`,
    weeklyYours: (n: string) => `Tu aporte: ${n}`,
    weeklyDone: "✅ ¡Cumplida! Todos los que aportaron recibieron 100 monedas.",
    weeklyReward: "-# Si se cumple antes del domingo, 100 monedas para cada guerrero que haya aportado.",
    weeklyAnnounce: (name: string, n: number) => `🛡️ **¡Misión del reino cumplida!** ${name}. ${n} ${n === 1 ? "guerrero recibe" : "guerreros reciben"} 100 monedas de plata.`,
    names: {
      kill_mobs_easy: (n: string) => `Abate ${n} enemigos`,
      mine_blocks_easy: (n: string) => `Pica ${n} bloques`,
      travel_easy: (n: string) => `Recorre ${n} km`,
      fish_easy: (n: string) => `Pesca ${n} peces`,
      breed_easy: (n: string) => `Cría ${n} animales`,
      kill_spiders: (n: string) => `Abate ${n} arañas`,
      kill_zombified_piglins: (n: string) => `Abate ${n} piglins zombificados`,
      kill_blazes: (n: string) => `Abate ${n} blazes`,
      mine_quartz: (n: string) => `Pica ${n} menas de cuarzo del Nether`,
      mine_end_stone: (n: string) => `Pica ${n} bloques de piedra del End`,
      mine_ancient_debris: (n: string) => `Pica ${n} escombros ancestrales`,
      kill_wither_skeletons: (n: string) => `Abate ${n} esqueletos wither`,
      kill_shulkers: (n: string) => `Abate ${n} shulkers`,
      kill_zombies: (n: string) => `Abate ${n} zombis`,
      kill_skeletons: (n: string) => `Abate ${n} esqueletos`,
      chop_logs: (n: string) => `Tala ${n} troncos`,
      travel_medium: (n: string) => `Recorre ${n} km`,
      mine_iron: (n: string) => `Pica ${n} menas de hierro`,
      trade: (n: string) => `Cierra ${n} tratos con aldeanos`,
      kill_creepers: (n: string) => `Abate ${n} creepers`,
      kill_endermen: (n: string) => `Abate ${n} endermen`,
      mine_diamonds: (n: string) => `Pica ${n} menas de diamante`,
      kill_mobs_hard: (n: string) => `Abate ${n} enemigos`,
      travel_hard: (n: string) => `Recorre ${n} km`,
      mine_blocks_hard: (n: string) => `Pica ${n} bloques`,
    } as Record<string, (n: string) => string>,
    tier: { easy: "🟢", medium: "🟡", hard: "🔴" } satisfies Record<TaskTier, string>,
    line: (tier: string, name: string, coins: string) => `${tier} ${name} · 🪙 ${coins}`,
    progress: (now: string, target: string) => `${now} / ${target}`,
    done: "✅",
    yourHeading: (name: string) => `### Tu progreso (${name})`,
    streak: (days: number, best: number) => `🔥 Racha: **${days}** ${days === 1 ? "día" : "días"} (mejor: ${best})`,
    noStreak: "🔥 Sin racha todavía: cumple las tres para empezarla.",
    bonusNote: "-# Cumplir las tres suma un día de racha y un extra (10 monedas por día de racha, hasta 70).",
    notLinked: "-# Únete al reino (botón «Acepto las runas») para ver tu progreso aquí.",
    resets: (when: string) => `-# Las misiones cambian ${when}.`,
    unavailable: "Las misiones del día no están disponibles ahora mismo.",
    // En el juego (texto plano)
    gameTitle: "Tus misiones de hoy (!tareas cambiar N: 20 monedas):",
    gameWeekly: (name: string, now: string, target: string) => `Reino: ${name} (${now}/${target})`,
    gameWeeklyDone: "¡Misión del reino cumplida! +100 monedas para todos los que aportaron.",
    gameRerolled: (task: string) => `Misión cambiada: ${task} (-20 monedas).`,
    paidNow: (name: string, coins: string) => `🎉 ¡Misión cumplida! ${name} · +${coins} 🪙`,
    paidStreak: (days: number, bonus: string) => `🔥 ¡Las tres de hoy! Racha de ${days} ${days === 1 ? "día" : "días"} · +${bonus} 🪙`,
    gameDone: (name: string, coins: string) => `Misión cumplida: ${name} (+${coins} monedas)`,
    gameStreak: (days: number, bonus: string) => `¡Las tres de hoy! Racha de ${days} ${days === 1 ? "día" : "días"} (+${bonus} monedas)`,
  },

  // Ruleta (la rueda de las nornas). El resultado solo lo ve quien tira.
  ruleta: {
    title: "🎡 La rueda de las nornas",
    groups: {
      nothing: "💨",
      refund: "🪙",
      survival: "🎒 Suministros",
      minerals: "⛏️ Minerales",
      rare: "✨ Raro",
      valuable: "💎 Valioso",
      books: "📕 Libro encantado",
      jackpot: "🏆 ¡BOTE!",
    } satisfies Record<LootGroupId, string>,
    nothing: "La rueda se detiene en vacío. Las nornas se ríen de ti.",
    refund: (n: string) => `Recuperas ${n} monedas.`,
    jackpot: (n: string) => `¡${n} monedas de plata!`,
    item: (count: string, name: string) => `${count} × ${name}`,
    book: (enchants: string) => `Libro de ${enchants}`,
    after: (balance: string, left: number) => `-# Te quedan 🪙 ${balance} y ${left} ${left === 1 ? "tirada" : "tiradas"} hoy. Cada tirada: 100 monedas.`,
    economyOff: "La rueda está quieta: la economía del reino no está abierta.",
    notLinked: "Primero únete al reino (botón «Acepto las runas» en #runas).",
    offline: "Tienes que estar conectado al reino para girar la rueda (el premio te llega al momento).",
    poor: (balance: string) => `No te alcanza: cada tirada cuesta 🪙 100 y tienes ${balance}.`,
    limit: "Ya has girado la rueda 5 veces hoy. Las nornas descansan hasta mañana.",
    busy: "La rueda aún está girando…",
    giveFailed: "No pude entregarte el premio (¿te has desconectado?). Te devuelvo las monedas.",
    // Registro de administración
    record: (player: string, prize: string) => `🎡 Ruleta: **${player}** se lleva ${prize}.`,
    // En el juego (texto plano)
    gameAfter: (balance: string, left: number) => `Te quedan ${balance} monedas y ${left} tiradas hoy.`,
  },

  // Canto del domingo (resumen semanal en el canal de los logros)
  weekly: {
    title: "📜 El canto del domingo",
    intro: (era: string) => `Esto cantó Skald junto al fuego sobre la semana en **${era}**:`,
    hours: (total: string, name: string, hours: string) => `⏳ **${total} h** en el reino entre todos. Quien más: **${name}** (${hours} h).`,
    kills: (name: string, n: string) => `⚔️ El más fiero: **${name}**, con ${n} enemigos abatidos.`,
    mined: (name: string, n: string) => `⛏️ El topo del reino: **${name}**, ${n} bloques picados.`,
    distance: (name: string, km: string) => `🧭 El trotamundos: **${name}**, ${km} km recorridos.`,
    deaths: (total: string, name: string, n: string) => `💀 **${total}** muertes en la semana. El más desgraciado: **${name}** (${n}).`,
    noDeaths: "💀 Ni una muerte en toda la semana. Hel se aburre.",
    advancements: (total: string, name: string, n: string) => `🏆 **${total}** logros nuevos. El más laureado: **${name}** (${n}).`,
    firsts: (list: string) => `🌟 Primeros del reino: ${list}.`,
    firstItem: (name: string, title: string) => `**${name}** ([${title}])`,
    coins: (name: string, n: string) => `🪙 El más rico de la semana: **${name}**, ${n} monedas de plata ganadas.`,
    // Dato curioso: la métrica rara con más movimiento.
    curious: {
      jumps: (p: string, n: string) => `🐸 ${p} ha saltado ${n} veces. ¿Huye de algo?`,
      chickens: (p: string, n: string) => `🐔 ${p} ha despachado ${n} pollos.`,
      fish: (p: string, n: string) => `🎣 ${p} ha sacado ${n} peces del agua.`,
      eggs: (p: string, n: string) => `🥚 ${p} ha lanzado ${n} huevos. Nadie sabe a quién.`,
      bells: (p: string, n: string) => `🔔 ${p} ha tocado la campana ${n} veces. Dong.`,
      trades: (p: string, n: string) => `🤝 ${p} ha cerrado ${n} tratos con aldeanos.`,
      breeding: (p: string, n: string) => `🐄 ${p} ha criado ${n} animales.`,
      logs: (p: string, n: string) => `🪓 ${p} ha talado ${n} troncos.`,
      diamonds: (p: string, n: string) => `💎 ${p} ha picado ${n} menas de diamante.`,
      elytra: (p: string, n: string) => `🪽 ${p} ha volado ${n} km con élitros.`,
      broken_tools: (p: string, n: string) => `🔨 ${p} ha roto ${n} herramientas de tanto darles.`,
    },
    quiet: "La semana fue tranquila: nadie pisó el reino. Las brasas esperan.",
    footer: "-# El próximo canto, el domingo que viene.",
  },

  // /cielo
  cielo: {
    title: "🌌 El cielo del reino",
    time: "🕰️ Hora",
    period: { dawn: "🌅 Amanecer", day: "☀️ Día", dusk: "🌇 Atardecer", night: "🌙 Noche" } satisfies Record<DayPeriod, string>,
    day: "📅 Día",
    dayValue: (n: string) => `**${n}** del reino`,
    moon: "🌙 Luna",
    moonNames: ["Luna llena", "Gibosa menguante", "Cuarto menguante", "Luna menguante", "Luna nueva", "Luna creciente", "Cuarto creciente", "Gibosa creciente"],
    moonHint: ["Noche de luna llena: los slimes salen en masa en los pantanos.", null, null, null, "Luna nueva: la noche más oscura. Antorchas a mano.", null, null, null],
    weather: "🌦️ Clima",
    clear: "☀️ Despejado",
    rain: "🌧️ Lluvia",
    thunder: "⛈️ Tormenta",
    rainEnds: (m: string) => `parará en ~${m} min`,
    rainStarts: (m: string) => `lloverá en ~${m} min`,
    clearForced: (m: string) => `despejado a la fuerza ~${m} min más`,
    paused: "⏸️ **El tiempo está detenido**: no hay nadie en el reino, así que ni el sol ni las nubes se mueven.",
    staleClock: "-# Hora según el último guardado del mundo (RCON no responde).",
    note: "-# Minutos de juego (con alguien conectado). El clima, según el último guardado del mundo.",
    unavailable: "Los astros no se dejan leer ahora mismo.",
  },

  // /hel
  hel: {
    optionName: "guerrero",
    optionDescription: "Solo las muertes de este guerrero (opcional)",
    title: "💀 Los dominios de Hel",
    titleFor: (name: string) => `💀 Las desgracias de ${name}`,
    lead: "Lo que más almas ha enviado al otro lado:",
    leadFor: (name: string) => `Lo que más veces ha enviado a ${name} al otro lado:`,
    combatEmoji: "⚔️",
    helEmoji: "🪦",
    unknownCause: "Causas que ni Hel conoce",
    split: (valhalla: string, hel: string) => `⚔️ Al Valhalla: **${valhalla}** · 🪦 A Hel: **${hel}**`,
    total: (n: string) => `-# ${n} muertes en todos los registros del reino.`,
    totalFor: (name: string, n: string) => `-# ${n} muertes de ${name} en los registros del reino.`,
    empty: "Nadie ha muerto aún en el reino. Hel se impacienta.",
    emptyFor: (name: string) => `${name} no ha muerto nunca… de momento. Hel tiene paciencia.`,
  },

  // /temporada (una temporada = un mundo; se llaman «eras»)
  temporada: {
    firstName: "Era I",
    actualDescription: "La era actual del reino",
    historialDescription: "Las eras pasadas y sus campeones",
    nuevaDescription: "Cierra la era actual y abre otra con el mundo del servidor (solo el Jarl)",
    nameOption: "nombre",
    nameOptionDescription: "Nombre de la era nueva (p. ej. «Era II» o «Yule»)",
    currentTitle: (name: string) => `🌍 ${name}`,
    world: "🗺️ Mundo",
    since: "📅 Desde",
    firsts: "🌟 Primeros del reino",
    paused: (level: string) =>
      `⏸️ El servidor carga un mundo nuevo (\`${level}\`). Las crónicas de esta era esperan a que el Jarl abra la siguiente.`,
    historyTitle: "📜 Las eras del reino",
    historyLine: (name: string, from: string, to: string | null) => `### ${name}\n${from} → ${to ?? "hoy"}`,
    champion: (label: string, name: string, value: string) => `${label}: **${name}** (${value})`,
    richest: "🪙 El más rico",
    noHistory: "Solo existe la era actual. La historia acaba de empezar.",
    onlyJarl: "Solo el Jarl puede abrir una era nueva.",
    opened: (closed: string | null, opened: string) =>
      closed ? `🔥 Termina **${closed}** y comienza **${opened}**.` : `🔥 Comienza **${opened}**.`,
    sameWorld: (level: string) =>
      `-# Ojo: el servidor sigue con el mismo mundo (\`${level}\`); los primeros del reino se vuelven a contar desde cero.`,
    unavailable: "Las crónicas de las eras no están disponibles (sin base de datos).",
    // Anuncio público al abrir una era (en los canales de avisos).
    announce: (name: string) => `# 🔥 Nace ${name}\nEl viejo reino arde a popa; el drakkar pone rumbo a tierras nuevas. Que los skaldas empiecen otra saga.`,
    summaryTitle: (name: string) => `📜 Así terminó ${name}`,
    announced: (n: number) => `-# Anunciado en ${n} ${n === 1 ? "canal" : "canales"}.`,
    proposalButton: "Abrir era nueva",
    modalTitle: "Abrir una era nueva",
    modalLabel: "Nombre de la era",
    modalDescription: "Se cierra la era actual (con su ranking) y se anuncia la nueva.",
    defaultName: (n: number) => `Era ${roman(n)}`,
    proposalDone: (name: string, user: string) => `✅ ${user} abrió **${name}**.`,
    // Aviso en el canal de administración.
    mismatchAlert: (level: string, season: string, old: string) =>
      `🌍 **Mundo nuevo detectado.** El servidor carga \`${level}\` y la era abierta es **${season}** (\`${old}\`).\n` +
      "Primeros del reino, hitos y monedas quedan en pausa. Cuando esté listo, abre la nueva con el botón (o con `/temporada nueva`).",
  },

  // /tesoro
  tesoro: {
    optionName: "guerrero",
    optionDescription: "El cofre de este guerrero (si no, los más ricos)",
    title: "🪙 Los cofres del reino",
    titleFor: (name: string) => `🪙 El cofre de ${name}`,
    coins: (n: string) => `**${n}** monedas de plata`,
    line: (medal: string, name: string, n: string) => `${medal} **${name}** · 🪙 ${n}`,
    todayHeading: "### Hoy",
    categories: {
      play_time: "⏳ Tiempo activo",
      mob_kills: "⚔️ Enemigos",
      blocks_mined: "⛏️ Bloques",
      distance: "🧭 Distancia",
    } satisfies Record<EarnCategory, string>,
    today: (label: string, earned: string, cap: string) => `${label} · ${earned} / ${cap}`,
    empty: "Los cofres del reino siguen vacíos. Las monedas se ganan jugando.",
    yours: (name: string, coins: string, rank: number | null) =>
      `**Tu cofre** (${name}): 🪙 ${coins}${rank ? ` · puesto **#${rank}**` : ""}`,
    note: "-# Se gana jugando: cuenta cada vez que el servidor guarda (cada ~5 min, y al desconectarte). El tiempo quieto (AFK) no cuenta. Cada era empieza de cero.",
    disabled: "La economía del reino aún no está abierta.",
  },

  // /regalo (solo administradores; respuestas que solo ve quien lo usa)
  regalo: {
    vistaDescription: "Lo que tocaría a cada guerrero por lo ya jugado (no paga nada)",
    aplicarDescription: "Reparte el regalo inicial (una sola vez por guerrero)",
    previewTitle: "🎁 Vista previa del regalo inicial",
    formula: (cap: string) =>
      `-# 1 moneda por cada 30 min jugados, 10 enemigos, 100 bloques o 2 km; tope de ${cap} por guerrero. Nada se paga hasta usar \`/regalo aplicar\`.`,
    line: (name: string, total: string, parts: string, capped: boolean) => `**${name}** · 🪙 ${total}${capped ? " (tope)" : ""}\n-# ${parts}`,
    total: (players: number, coins: string) => `**Total:** 🪙 ${coins} entre ${players} guerreros.`,
    empty: "Aún no hay nadie de quien saber lo jugado: espera a la primera cuenta de Skald (~5 min tras activar la economía).",
    applied: (players: number, coins: string) => `🎁 Regalo repartido: 🪙 ${coins} entre ${players} guerreros. Quien aparezca más tarde lo recibirá al llegar.`,
    alreadyApplied: "El regalo de esta era ya se repartió.",
    onlyJarl: "Solo el Jarl puede tocar el tesoro del reino.",
  },

  // Panel del reino (mensaje fijo que se edita solo). Se reconoce por el pie: no cambiarlo.
  panel: {
    footer: "Skald · estado del reino · se actualiza solo",
    title: "📊 Estado del reino",
    awake: "🔥 **El reino está despierto.**",
    empty: "🌙 **Silencio en las salas.** El servidor está en marcha, pero no hay nadie.",
    lagging: "⚠️ **El reino se tambalea.** La forja no da abasto.",
    asleep: "💤 **El reino duerme.** El servidor no responde.",
    warriors: (online: number, max: number) => `⚔️ Guerreros (${online}/${max})`,
    nobody: "Nadie",
    tps: "⏱️ TPS",
    mspt: "⚙️ Tiempo por tick",
    noTicks: "Sin datos",
    version: "🏷️ Versión",
    era: "🌍 Era",
    eraPending: (level: string) => `\n⏸️ Mundo nuevo (\`${level}\`) a la espera de era`,
    backup: "💾 Última copia",
    backupNone: "Ninguna",
    backupWarn: { ok: "", none: "", stale: " ⚠️ antigua", small: " ⚠️ pequeña" } satisfies Record<BackupStatus, string>,
    changed: "Último cambio",
  },

  // Auditoría (canal de administración). {a} = quien lo hizo, {t} = a quién; ya en negrita.
  audit: {
    title: "🛡️ Registro del reino",
    console: "la consola",
    rcon: "la consola (RCON)",
    gamemode_self: (a: string, mode: string) => `🎮 ${a} se ha puesto en **${mode}**.`,
    gamemode_other: (a: string, t: string, mode: string) => `🎮 ${a} ha puesto a ${t} en **${mode}**.`,
    op: (a: string, t: string) => `👑 ${a} ha hecho operador a ${t}.`,
    deop: (a: string, t: string) => `👑 ${a} le ha quitado el operador a ${t}.`,
    ban: (a: string, t: string, reason: string) => `🔨 ${a} ha desterrado a ${t}${reason ? `: «${reason}»` : ""}.`,
    pardon: (a: string, t: string) => `🕊️ ${a} ha levantado el destierro de ${t}.`,
    kick: (a: string, t: string, reason: string) => `👢 ${a} ha echado a ${t}${reason ? `: «${reason}»` : ""}.`,
    whitelist_add: (a: string, t: string) => `📜 ${a} ha añadido a ${t} a la lista blanca.`,
    whitelist_remove: (a: string, t: string) => `📜 ${a} ha quitado a ${t} de la lista blanca.`,
    // Roles de Discord
    rolesAdded: (member: string, roles: string) => `🏷️ ${member} recibe ${roles}`,
    rolesRemoved: (member: string, roles: string) => `🏷️ ${member} pierde ${roles}`,
    by: (executor: string) => ` (por ${executor})`,
  },

  // Aviso de lag (canal de administración)
  lag: {
    alert: (tps: string, mspt: string) =>
      `⚠️ **El reino se tambalea.** Lleva unos minutos con **${tps} TPS** (${mspt} ms por tick).\n` +
      "-# Para ver qué lo causa: `/spark profiler start`, espera un par de minutos y `/spark profiler stop`.",
    recovered: (minutes: number, tps: string) => `✅ **El reino vuelve a ir fino** (${tps} TPS) tras ${minutes} min de lag.`,
  },

  // Skald en el chat del juego (texto plano: sin Markdown de Discord)
  game: {
    prefix: "[Skald] ",
    link: "[abrir en Discord]",
    newQuedada: (title: string, when: string) => `Nueva quedada: ${title} (${when}). Pulsa «Interesado» en Discord para que te avise.`,
    quedadaSoon: (title: string) => `La quedada «${title}» empieza en 30 minutos. ¡Al salón, guerreros!`,
    // !ayuda: un solo mensaje; cada comando se puede pulsar y enseña su uso al pasar el ratón.
    helpTitle: "Comandos de Skald:",
    helpItems: [
      { cmd: "!recordar", desc: "aviso en Discord", usage: "!recordar 2h | regar\n(30m, 2h, mañana 18:00, 24/12 21:30)" },
      { cmd: "!quedada", desc: "evento en Discord", usage: "!quedada 24/12 21:30 | Asalto al Nether" },
      { cmd: "!encuesta", desc: "encuesta", usage: "!encuesta ¿Nether o End? | Nether | End" },
      { cmd: "!tesoro", desc: "tus monedas", usage: "!tesoro" },
      { cmd: "!cielo", desc: "hora, luna y clima", usage: "!cielo" },
      { cmd: "!tareas", desc: "tus misiones", usage: "!tareas" },
      { cmd: "!ruleta", desc: "gira la rueda (100)", usage: "!ruleta" },
    ],
    // !cielo (texto plano para el chat del juego)
    skyPeriod: { dawn: "Amanecer", day: "Día", dusk: "Atardecer", night: "Noche" } satisfies Record<DayPeriod, string>,
    skyLine: (period: string, time: string, day: string, moon: string) => `${period}, ${time} · día ${day} · ${moon}`,
    skyWeather: (w: string) => `Clima: ${w}`,
    skyPaused: "El tiempo está detenido (no hay nadie).",
    skyUnknown: "Los astros no se dejan leer ahora mismo.",
    notLinked: "Primero únete al reino en Discord: pulsa «Acepto las runas» en #runas.",
    // Saludo al entrar al servidor (solo lo ve quien entra).
    welcome: [
      (p: string) => `¡Salve, ${p}! Las brasas del salón siguen encendidas.`,
      (p: string) => `${p} cruza el Bifröst. Bienvenido de vuelta al reino.`,
      (p: string) => `Los cuervos ya cantan tu llegada, ${p}.`,
      (p: string) => `Odín te saluda, ${p}. Que hoy la lava no te encuentre.`,
    ],
    company: (names: string) => `En el reino: ${names}.`,
    alone: "Eres el único guerrero en las salas ahora mismo.",
    coins: (coins: string) => `Tienes ${coins} monedas de plata`,
    helpLink: "!ayuda",
    helpHover: "Haz clic: te dejo !ayuda escrito en el chat",
    notLinkedTip: "Únete al reino en Discord («Acepto las runas» en #runas) para usar mis comandos.",
    // Adornos del saludo (runas neutras).
    welcomeMark: "⚔ ",
    lineMarks: ["ᚠ ", "ᚱ "],
    unknown: (cmd: string) => `No conozco «!${cmd}». Escribe !ayuda.`,
    slowDown: "Despacio, guerrero: un comando cada pocos segundos.",
    tooMany: "Ya has creado bastantes cosas esta hora. Inténtalo más tarde.",
    reminderUsage: "Uso: !recordar <cuándo> | <texto>   (cuándo: 30m, 2h, mañana 18:00, 24/12 21:30)",
    reminderSaved: (when: string) => `Hecho: te lo recordaré por Discord el ${when}.`,
    quedadaUsage: "Uso: !quedada <cuándo> | <título>   (ej.: !quedada 24/12 21:30 | Asalto al Nether)",
    quedadaDone: (title: string) => `Quedada «${title}» creada en Discord.`,
    pollUsage: "Uso: !encuesta <pregunta> | <opción> | <opción> (de 2 a 8 opciones)",
    pollDone: "Encuesta publicada en Discord.",
    badDate: "No entiendo cuándo. Prueba 30m, 2h, mañana 18:00 o 24/12 21:30.",
    pastDate: "Esa hora ya ha pasado (o es demasiado pronto).",
    farDate: "Como mucho, con un año de antelación.",
    tooManyReminders: "Tienes demasiados recordatorios pendientes.",
    balance: (coins: string) => `Tienes ${coins} monedas de plata.`,
    noEconomy: "La economía del reino aún no está abierta.",
    discordDown: "No llego a Discord ahora mismo. Inténtalo en un rato.",
    // Cabeceras en Discord de lo creado desde el juego.
    fromGame: (user: string) => `🎮 Desde el juego, por ${user}`,
  },

  // Vinculación Discord ↔ Minecraft (botón de las runas, /vincular, /desvincular)
  link: {
    button: "Acepto las runas",
    modalTitle: "Únete al reino",
    modalLabel: "Tu nombre en Minecraft",
    modalDescription: "El de tu cuenta de Java (el que ves al entrar al juego).",
    invalidName: "Ese no parece un nombre de Minecraft (3-16 letras, números o _).",
    notFound: (name: string) => `Mojang no conoce ninguna cuenta llamada **${name}**. ¿Está bien escrito?`,
    mojangDown: "Los cuervos no llegan hasta Mojang ahora mismo. Inténtalo en un rato.",
    confirmTitle: "¿Eres tú?",
    confirmBody: (name: string) =>
      `Vas a unir tu cuenta de Discord con **${name}**. Solo se puede hacer **una vez**; si te equivocas, tendrá que arreglarlo el Jarl.`,
    confirm: "Sí, soy yo",
    cancel: "Cancelar",
    cancelled: "Cancelado. Puedes volver a pulsar «Acepto las runas» cuando quieras.",
    alreadyLinked: (name: string) => `Ya estás unido al reino como **${name}**.`,
    uuidTaken: "Esa cuenta de Minecraft ya está unida a otra persona. Si es tuya, habla con el Jarl.",
    linkedPending: (name: string) =>
      `✅ Hecho, **${name}**. En cuanto entres al servidor por primera vez serás **Einherjar** y verás todo el reino. Para entrar, escribe al Jarl.`,
    linkedActive: (name: string) => `⚔️ Bienvenido, **${name}**: ya eres **Einherjar** y ves todo el reino.`,
    promotedTitle: "⚔️ Has llegado al Valhalla",
    promotedBody: (name: string) =>
      `**${name}**, has entrado al reino por primera vez: desde hoy eres **Einherjar** y ves todos los salones. ¡Skål!`,
    disabled: "La unión al reino no está disponible ahora mismo.",
    // Avisos al canal de administración.
    adminLinked: (user: string, name: string, status: string) => `🔗 ${user} se unió como **${name}** (${status}).`,
    adminLinkedBy: (user: string, name: string, admin: string, status: string) => `🔗 ${admin} unió a ${user} con **${name}** (${status}).`,
    adminPromoted: (user: string, name: string) => `⚔️ ${user} (**${name}**) entró al servidor: ahora es Einherjar.`,
    adminConflict: (user: string, name: string, other: string) => `⚠️ ${user} intentó unirse como **${name}**, que ya está unido a ${other}.`,
    adminUnlinked: (user: string, name: string, admin: string) => `✂️ ${admin} desvinculó a ${user} de **${name}**.`,
    // Inactividad (Fase 3)
    inactiveTitle: "💤 Tu escaño en el salón espera",
    inactiveBody: (name: string, days: number) =>
      `**${name}**, llevas ${days} días sin pisar el reino, así que vuelves a ser **Viajero** por ahora. ` +
      "En cuanto entres al servidor recuperarás tu sitio entre los Einherjar, sin hacer nada más. ¡Te esperamos!",
    returnTitle: "⚔️ Has vuelto al Valhalla",
    returnBody: (name: string) => `**${name}**, el salón te recibe de nuevo: vuelves a ser **Einherjar**. ¡Skål!`,
    adminInactive: (user: string, name: string, days: number) => `💤 ${user} (**${name}**) lleva ${days} días sin entrar: vuelve a Viajero.`,
    adminInactiveNoDm: (user: string) => `-# No pude avisar a ${user} por privado (los tiene cerrados).`,
    adminReturned: (user: string, name: string) => `⚔️ ${user} (**${name}**) ha vuelto al reino: Einherjar de nuevo.`,
    statusPending: "pendiente de entrar",
    statusActive: "Einherjar",
    // /vincular y /desvincular
    vincularDescription: "Une a alguien con su cuenta de Minecraft (solo el Jarl)",
    desvincularDescription: "Deshace la unión de alguien (solo el Jarl)",
    userOption: "usuario",
    userOptionDescription: "La persona de Discord",
    nameOption: "nombre",
    nameOptionDescription: "Su nombre en Minecraft",
    onlyJarl: "Solo el Jarl puede unir o separar guerreros.",
    adminDone: (user: string, name: string, status: string) => `🔗 ${user} queda unido como **${name}** (${status}).`,
    adminTaken: (user: string, name: string) => `${user} ya está unido como **${name}**. Desvincúlalo primero.`,
    adminUuidTaken: (other: string) => `Esa cuenta de Minecraft ya está unida a ${other}.`,
    unlinked: (user: string, name: string) => `✂️ ${user} ya no está unido a **${name}**. Sus roles no se tocan.`,
    notLinked: (user: string) => `${user} no está unido a ninguna cuenta.`,
  },

  // /encuesta (encuestas nativas de Discord)
  encuesta: {
    question: "pregunta",
    questionDescription: "Lo que quieres preguntar al reino",
    option: (n: number) => `opcion${n}`,
    optionDescription: (n: number) => (n <= 2 ? `Opción ${n}` : `Opción ${n} (opcional)`),
    hours: "horas",
    hoursDescription: "Cuántas horas estará abierta (por defecto 24; máximo 168)",
    multiple: "varias",
    multipleDescription: "Se puede elegir más de una opción",
    header: (user: string) => `📊 **Encuesta de ${user}.** Cuando cierre, Discord publicará el resultado.`,
    done: "✅ Encuesta publicada.",
    noPermission: "Skald no puede publicar encuestas en este canal (necesita «Enviar mensajes» y «Crear encuestas»).",
    duplicated: "Hay opciones repetidas.",
  },

  // /quedada (eventos de Discord)
  quedada: {
    title: "titulo",
    titleDescription: "Qué se hace (p. ej. «Asalto al Nether»)",
    date: "cuando",
    dateDescription: "Cuándo empieza: «24/12 21:30», «mañana 18:00» o «21:30»",
    hours: "horas",
    hoursDescription: "Cuánto dura, en horas (por defecto 2)",
    details: "detalles",
    detailsDescription: "Más información (opcional)",
    location: (era: string | null) => (era ? `Minecraft · ${era}` : "Minecraft · el reino"),
    announceTitle: (title: string) => `📯 Quedada: ${title}`,
    announceBody: (start: string, relative: string, hours: string, user: string) =>
      `**Cuándo:** ${start} (${relative})\n**Duración:** ${hours} h\n**Convoca:** ${user}`,
    announceFooter: "-# Pulsa «Interesado» en el evento y Skald te avisará 30 minutos antes.",
    soon: (title: string, relative: string) => `⏰ **${title}** empieza ${relative}.`,
    soonNobody: "-# Nadie ha marcado «Interesado»… aún hay tiempo.",
    done: (url: string) => `✅ Quedada creada: ${url}`,
    badDate: "No entiendo esa fecha. Prueba con «24/12 21:30», «mañana 18:00» o «21:30».",
    past: "Esa hora ya ha pasado.",
    tooFar: "Como mucho, con un año de antelación.",
    noPermission: "Skald no puede crear eventos en este servidor: dale el permiso «Crear eventos» (o «Gestionar eventos»).",
  },

  // /recordatorio
  recordatorio: {
    nuevoDescription: "Que Skald te recuerde algo",
    listaDescription: "Tus recordatorios pendientes",
    borrarDescription: "Borra uno de tus recordatorios",
    when: "cuando",
    whenDescription: "«30m», «2h», «mañana 18:00», «24/12 21:30»",
    text: "texto",
    textDescription: "Lo que hay que recordar",
    channel: "en_canal",
    channelDescription: "Recordarlo en este canal (para todos) en vez de por privado",
    id: "numero",
    idDescription: "El número que sale en /recordatorio lista",
    saved: (when: string, relative: string, where: string) => `⏳ Hecho. Te lo recordaré ${when} (${relative}) ${where}.`,
    byDm: "por privado",
    inChannel: "en este canal",
    listTitle: "⏳ Tus recordatorios",
    listLine: (id: number, when: string, text: string, inChannel: boolean) => `**#${id}** · ${when}${inChannel ? " · en canal" : ""}\n${text}`,
    listEmpty: "No tienes recordatorios pendientes.",
    deleted: (id: number) => `🗑️ Recordatorio #${id} borrado.`,
    notFound: "No tienes ningún recordatorio pendiente con ese número.",
    tooMany: (n: number) => `Ya tienes ${n} recordatorios pendientes; borra alguno antes.`,
    badDate: "No entiendo cuándo. Prueba con «30m», «2h», «mañana 18:00» o «24/12 21:30».",
    tooSoon: "Tiene que ser dentro de al menos un minuto.",
    tooFar: "Como mucho, dentro de un año.",
    // Entrega
    title: "⏳ Recordatorio",
    forUser: (user: string) => `${user}, esto querías recordarlo:`,
    fromUser: (user: string) => `Recordatorio de ${user}:`,
    late: "-# Llega con retraso: Skald estaba dormido.",
    unavailable: "Los recordatorios no están disponibles (sin base de datos).",
  },

  // /duelo
  duelo: {
    optionA: "guerrero",
    optionB: "rival",
    optionADescription: "Quien lanza el desafío",
    optionBDescription: "Quien lo recibe",
    title: "⚔️ Duelo en el reino",
    versus: (a: string, b: string) => `## ${a} 🆚 ${b}`,
    lowerWinsNote: "-# En las muertes gana quien menos tiene: morir no es ninguna hazaña.",
    winner: (name: string, won: number, lost: number) => `## 🏆 ${name} gana ${won} a ${lost}`,
    tie: (n: number) => `## 🤝 Empate a ${n}`,
    verdicts: [
      "Los skaldas ya afinan el arpa para cantarlo.",
      "Las valquirias han tomado nota.",
      "Odín observa desde Hliðskjálf y asiente.",
      "Que el vencido invite al hidromiel.",
    ],
    tieVerdict: "Ni los dioses se ponen de acuerdo. Habrá revancha.",
    sameWarrior: "Un guerrero no puede batirse consigo mismo… salvo en Hel.",
    note: "-# Según el último guardado del mundo (cada ~5 min).",
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
    firsts: (n: number) => (n === 1 ? "🌟 **1** primero del reino" : `🌟 **${n}** primeros del reino`),
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
    // Nadie en el reino lo había conseguido antes.
    first: {
      task: (p: string, t: string) => `🌟 **¡Primero del reino!** ${p} es el primer guerrero en conseguir el logro **[${t}]**.`,
      challenge: (p: string, t: string) => `🌟 **¡Primero del reino!** ${p} es el primer guerrero en completar el desafío **[${t}]**.`,
      goal: (p: string, t: string) => `🌟 **¡Primero del reino!** ${p} es el primer guerrero en alcanzar la meta **[${t}]**.`,
    } satisfies Record<AdvancementKind, (p: string, t: string) => string>,
    firstNote: "-# Ningún guerrero lo había logrado antes. Los skaldas lo cantarán por generaciones.",
    // Hitos personales. {p} en negrita; {n} ya formateado.
    milestone: {
      play_time: (p: string, n: string) => `⏳ ${p} ya lleva **${n} horas** en el reino. Los bancos del salón tienen su forma.`,
      distance: (p: string, n: string) => `🧭 ${p} ha recorrido **${n} km** por el reino. Ni los cuervos de Odín vuelan tanto.`,
      mob_kills: (p: string, n: string) => `⚔️ ${p} ha abatido a su enemigo número **${n}**. Las valquirias toman nota.`,
      deaths: (p: string, n: string) => `🪦 ${p} ha muerto **${n} veces**. Hel ya le guarda sitio en su mesa.`,
      blocks_mined: (p: string, n: string) => `⛏️ ${p} ha picado **${n} bloques**. Los enanos de Nidavellir lo quieren en su forja.`,
      dragon: (p: string) => `🐉 ${p} ha derrotado al **dragón del End**. Su nombre ya se canta en todo el reino.`,
      wither: (p: string) => `🥀 ${p} ha derrotado al **Wither**. Hasta los jotuns se apartan a su paso.`,
    } satisfies Record<MilestoneId, (p: string, n: string) => string>,
    dropped: (n: number) => `-# …y ${n} avisos más que los cuervos no pudieron cargar.`,
  },

  // /saga
  saga: {
    title: "📖 La saga del reino",
    empty: "Las crónicas de hoy siguen en blanco. Nadie ha muerto ni ha logrado nada… aún.",
    note: "-# Hazañas y caídas del registro de hoy.",
    deathEmoji: { combat: "⚔️", hel: "🪦" },
    advancementEmoji: { task: "🏆", challenge: "🎖️", goal: "🎯" } satisfies Record<AdvancementKind, string>,
    firstEmoji: "🌟",
  },

  // Heraldo (#gjallarhorn). {m} = mención del usuario; {r} = referencia a las runas.
  herald: {
    welcome: [
      (m: string, r: string) => `📯 **Suena el Gjallarhorn.** ${m} cruza el Bifröst y llega al reino. Lee las ${r} antes de sentarte en el salón.`,
      (m: string, r: string) => `📯 Un nuevo viajero a las puertas: bienvenido, ${m}. Las ${r} te esperan.`,
      (m: string, r: string) => `📯 Heimdall ha visto llegar a ${m}. Que alguien le sirva hidromiel… después de leer las ${r}.`,
    ],
    farewell: [
      (n: string) => `🌫️ **${n}** ha partido del reino. Que los vientos le sean favorables.`,
      (n: string) => `🌫️ **${n}** ha cruzado el Bifröst de vuelta. Su asiento en el salón queda libre.`,
    ],
    boost: (m: string, count: number, tier: number) =>
      `💎 ${m} ha ofrendado un boost al reino. ¡Skål! Ya son ${count} ${count === 1 ? "ofrenda" : "ofrendas"}${tier > 0 ? ` (nivel ${tier})` : ""}.`,
    // Embed que acompaña a la bienvenida
    welcomeTitle: "📯 Suena el Gjallarhorn",
    welcomeLines: (opts: { role: string | null; rules: string; jarl: string | null }) =>
      [
        opts.role ? `🧭 Ya llevas el rol **${opts.role}**.` : null,
        `📜 Empieza por las ${opts.rules}: normas, salones y cómo entrar.`,
        `⚔️ ¿Quieres jugar en Valhalla? Escríbele a ${opts.jarl ?? "el Jarl"}.`,
        "🍺 Coge un cuerno de hidromiel y siéntate. ¡Skål!",
      ]
        .filter(Boolean)
        .join("\n"),
    memberNumber: (n: number) => `Eres el miembro nº ${n} del reino`,
    farewellTitle: "🌫️ Un drakkar zarpa",
    boostTitle: "💎 Una ofrenda para el reino",
    dm: (name: string, guild: string, rulesUrl: string | null) =>
      [
        `Saludos, **${name}**. Soy Skald, el bardo de **${guild}**.`,
        rulesUrl ? `Antes de sentarte en el salón, lee las runas del reino: ${rulesUrl}` : null,
        "Si quieres jugar en Valhalla, nuestro servidor de Minecraft, escríbele al Jarl. ¡Skål!",
      ]
        .filter(Boolean)
        .join("\n\n"),
    rulesFallback: "runas",
  },

  // Mensaje fijo de #runas. Si cambia, Skald edita su mensaje al desplegarse.
  // Usa Markdown de Discord: # ## ### (cabeceras), -# (subtexto), ``` (bloque de código).
  rules: {
    intro: [
      "# 📜 Las runas del reino",
      "Bienvenido al reino, viajero. Aquí se juega, se construye y se muere con honor (o se cae a la lava, que también pasa).",
    ].join("\n"),
    rulesLead: "## ⚖️ Las normas\nEstas son las runas que todos respetamos:",
    numbers: ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"],
    list: [
      { title: "Honra a los demás guerreros", text: "Nada de insultos, acoso ni discriminación." },
      { title: "Lo ajeno no se toca", text: "Nada de griefing ni robos: lo que no es tuyo, se pide." },
      { title: "El PvP, solo si los dos aceptan", text: "Nada de emboscadas a quien no quiere pelea." },
      {
        title: "Sin trampas",
        text: "Nada de hacks, X-ray, duplicaciones ni exploits. Mods de rendimiento y estéticos, sí; si dudas, pregunta al Jarl.",
      },
      { title: "Cuida el reino", text: "Granjas grandes con cabeza, que no hundan el TPS (`/reino` lo chiva)." },
      { title: "Respeta el espacio", text: "Construye a una distancia razonable de los demás, salvo que te inviten." },
      { title: "En Discord, cada cosa en su canal", text: "Sin spam ni contenido NSFW." },
      { title: "La palabra del Jarl es ley", text: "Y la de sus huscarles también." },
    ],
    channelsHeading: "## 🗺️ Los salones del reino",
    // `find`: texto que se busca en el nombre del canal para enlazarlo (<#id>).
    // Si no se encuentra (canal renombrado o borrado), sale `label` como texto.
    groups: [
      {
        title: "🏰 Asgard",
        channels: [
          { find: "runas", label: "📜┃runas", description: "estás aquí" },
          { find: "gjallarhorn", label: "📯┃gjallarhorn", description: "llegadas, boosts y anuncios" },
        ],
      },
      {
        title: "🍺 Mjödsal",
        channels: [
          { find: "salón-del-trono", label: "👑┃salón-del-trono", description: "charla general" },
          { find: "hoguera", label: "🔥 Hoguera del clan", description: "voz" },
        ],
      },
      {
        title: "⚔️ Valhalla",
        channels: [
          { find: "crónicas", label: "📖┃crónicas", description: "pregúntale a Skald: `/reino`, `/gestas`, `/cronica`, `/saga`…" },
          { find: "cuervos", label: "🐦‍⬛┃cuervos", description: "Skald avisa de lo que pasa en el Minecraft" },
          { find: "la-forja", label: "⚒️┃la-forja", description: "capturas de construcciones" },
          { find: "hazañas", label: "🎬┃hazañas", description: "clips y momentos épicos" },
        ],
      },
    ],
    joinHeading: "## ⚔️ Cómo entrar en Valhalla",
    joinIntro: (version: string | null) =>
      `Minecraft **Java${version ? ` ${version}` : ""}**, sin mods. El reino está protegido tras el Bifröst, así que hace falta un túnel de acceso:`,
    // `to` = "a @Fulano" o "al Jarl"
    joinSteps: (to: string, button: boolean) => [
      ...(button ? ["Pulsa **📜 Acepto las runas** aquí abajo y escribe tu nombre de Minecraft."] : []),
      `Pídele el túnel ${to}.`,
      "Conéctate al túnel.",
      "En Minecraft: **Multijugador → Añadir servidor**, con la dirección de abajo.",
      button ? "¡A jugar! Al entrar por primera vez serás **⚔️ Einherjar** y verás todo el reino." : "¡A jugar! Recibirás el rol **⚔️ Einherjar**.",
    ],
    addressHeading: "### 📍 Dirección del reino",
    jarlFallback: "al Jarl",
    // También sirve para reconocer el mensaje de Skald y editarlo: no cambiar a la ligera.
    footer: "Skald · cantor del reino · Este mensaje se actualiza solo",
  },

  // /memoria y avisos de copias (Muninn, el cuervo de la memoria)
  memoria: {
    title: "🐦‍⬛ La memoria del reino",
    intro: "Cada noche, Muninn vuela sobre el reino y guarda una copia de todo lo construido.",
    status: {
      ok: "✅ A salvo",
      none: "⚠️ No hay ninguna memoria guardada",
      stale: "⚠️ La última memoria es demasiado antigua",
      small: "⚠️ La última memoria pesa sospechosamente poco",
    },
    fields: {
      status: "Estado",
      latest: "Última memoria",
      size: "Tamaño",
      count: "Memorias guardadas",
      history: "Últimas memorias",
    },
    count: (n: number, total: string) => `${n} · ${total} en total`,
    none: "Muninn aún no ha guardado ninguna memoria.",
  },
  backupAlerts: {
    none: "⚠️ **Muninn no encuentra ninguna memoria** en la carpeta de copias. Revisad `minecraft-backup`.",
    stale: (when: string, hours: number) =>
      `⚠️ **Muninn no ha vuelto.** La última memoria del reino es de ${when} (hace más de ${hours} h). Revisad \`minecraft-backup\`.`,
    small: (size: string, previous: string) =>
      `⚠️ **La última memoria pesa sospechosamente poco:** ${size}, frente a ${previous} de la anterior. Puede estar incompleta.`,
    unavailable: "⚠️ **No puedo leer la carpeta de copias.** ¿Está montada en el contenedor?",
    recovered: (when: string, size: string) => `✅ **Muninn ha vuelto:** memoria del reino guardada ${when} (${size}).`,
  },

  /** Cuando no se sabe el nombre de un UUID. */
  unknownWarrior: (uuid: string) => `Guerrero ${uuid.slice(0, 8)}`,

  // Errores
  ravensSilent: "🐦‍⬛ Los cuervos no traen noticias. Inténtalo de nuevo.",
  parseError:
    "📜 Las runas que devuelve el servidor no se dejan leer. Seguramente ha cambiado de versión; queda anotado.",
  wrongGuild: "Skald solo canta en su propio salón.",
  wrongChannel: (where: string) => `🎶 Aquí no canto, guerrero. Búscame en ${where}.`,
  worldUnavailable: "📜 No encuentro las crónicas del mundo: no puedo leer los ficheros del servidor.",
  backupsUnavailable: "🐦‍⬛ Muninn no encuentra la carpeta de las memorias (copias de seguridad).",

  // Presencia: estado personalizado, se lee tal cual bajo el nombre del bot
  // (sin «Viendo» / «Escuchando» delante), así que cada texto va completo.
  presence: {
    starting: "🔥 Vigilando las brasas del reino",
    withPlayers: (n: number) => `⚔️ ${warriors(n)} en el reino`,
    empty: "🌙 Silencio en las salas",
    offline: "💤 El reino duerme (offline)",
  },
} as const;
