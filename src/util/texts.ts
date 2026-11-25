/**
 * Todos los textos de Skald, el bardo del reino (temática nórdica).
 * Para cambiar el tono basta con tocar este fichero.
 */
import type { AdvancementKind } from "../core/logwatch.js";
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
    note: "-# Se gana jugando: Skald hace cuentas cada ~5 min. El tiempo quieto (AFK) no cuenta.",
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
    joinSteps: (to: string) => [
      `Pídele el túnel ${to}.`,
      "Conéctate al túnel.",
      "En Minecraft: **Multijugador → Añadir servidor**, con la dirección de abajo.",
      "¡A jugar! Recibirás el rol **⚔️ Einherjar**.",
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
