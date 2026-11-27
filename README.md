# Skald

Bot de Discord para un servidor de Minecraft Java. Skald, el bardo del reino, canta las crónicas del mundo: quién está conectado, cómo va el servidor y dónde está el mapa.

Pensado para servidores **vanilla**, con una capa de adaptadores para dar soporte más adelante a Fabric, Forge, NeoForge o Paper sin tocar el núcleo.

> Probado con Minecraft Java **26.2** (vanilla).

## Comandos

| Comando | Qué hace |
|---|---|
| `/reino` | Estado del reino: jugadores, TPS, tiempo por tick, latencia y versión |
| `/guerreros` | Quién está conectado ahora mismo |
| `/cielo` | El cielo del reino: hora, día del mundo, fase de la luna (con su dibujo) y clima, con cuándo cambia |
| `/gestas <categoría>` | Rankings: tiempo jugado, muertes, mobs, distancia… y otros menos serios (pasto de creepers, muertes tontas, lanzahuevos, rage quit…) |
| `/cronica <guerrero>` | Ficha de un jugador: horas, muertes y su verdugo, presa favorita, bloque más picado, distancia, primeros del reino y últimos logros |
| `/duelo <guerrero> <rival>` | Enfrenta a dos jugadores gesta a gesta (en las muertes gana quien menos tiene) y da el marcador final |
| `/hel [guerrero]` | Qué mata más en el reino (o a un guerrero): causas de muerte de todos los logs, Valhalla contra Hel |
| `/tareas` | Las tres misiones del día (fácil, media y difícil), tu progreso y tu racha |
| `/tesoro [guerrero]` | Monedas de plata: los cofres más llenos (y el tuyo, con tu puesto, si estás unido al reino), o el de un guerrero con lo ganado hoy |
| `/temporada actual \| historial \| nueva` | Las eras del reino (una por mundo): la actual, las pasadas con sus campeones y, solo para administradores, abrir una nueva |
| `/quedada <titulo> <cuando> [horas] [detalles]` | Crea un evento de Discord («Minecraft · era actual»), lo anuncia en el canal y avisa a los interesados 30 min antes |
| `/encuesta <pregunta> <opcion1> <opcion2> … [horas] [varias]` | Encuesta nativa de Discord (hasta 8 opciones); al cerrar, Discord publica el resultado |
| `/recordatorio nuevo \| lista \| borrar` | Recordatorios por privado o en el canal («30m», «2h», «mañana 18:00», «24/12 21:30») |
| `/saga` | Las últimas muertes y logros del reino |
| `/memoria` | Estado de las copias de seguridad: última copia, tamaño e historial |
| `/runas` | Versión, cargador y datos técnicos del servidor |
| `/mapa` | Enlace al mapa web (BlueMap), si está configurado |
| `/ayuda` | Lista de comandos (solo la ve quien la pide) |

Además, el bot muestra un estado personalizado según cómo esté el servidor:

| Situación | Estado | Texto |
|---|---|---|
| Con jugadores | En línea | ⚔️ *n* guerreros en el reino |
| Vacío | Ausente | 🌙 Silencio en las salas |
| Caído | No molestar | 💤 El reino duerme (offline) |

### Avisos en un canal

Si se configura `ALERT_CHANNEL_ID`, Skald sigue el log del servidor y avisa en ese canal de:

- 🟢 entradas y 🔴 salidas (salir y volver en menos de 20 s no genera avisos),
- muertes, en español: en combate, las valquirias se los llevan al **Valhalla**; las muertes sin gloria (caídas, lava, ahogamientos…) son para **Hel**,
- 🏆 logros, 🎖️ desafíos y 🎯 metas, con su nombre en español; 🌟 **primero del reino** si nadie lo había conseguido antes (el histórico sale de los ficheros del mundo),
- 🔥 arranque y 🌑 parada del servidor.
- hitos personales (van al canal de los logros): ⏳ horas jugadas, 🧭 km recorridos, ⚔️ enemigos abatidos, 🪦 muertes, ⛏️ bloques picados, 🐉 dragón del End y 🥀 Wither. Lo ya superado antes de activar Skald no se anuncia.

Los avisos se agrupan y tienen un límite por minuto. `ALERT_EVENTS` elige qué tipos se avisan, y cada tipo puede ir a su propio canal (`ALERT_CHANNEL_JOIN`, `_LEAVE`, `_DEATH`, `_ADVANCEMENT`, `_SERVER`); los que no tengan canal propio van a `ALERT_CHANNEL_ID`. El bot necesita en ese canal los permisos *Ver canal*, *Enviar mensajes* e *Insertar enlaces*; si falta alguno, lo dice en su log al arrancar.

Las muertes se reconocen con las plantillas oficiales del juego (`death.*`), que Skald lee del jar del servidor (`versions/<versión>/server-<versión>.jar`, en solo lectura), así que cubre todas las causas de muerte de la versión instalada.

### Copias de seguridad

Skald vigila la carpeta de copias (montada en solo lectura; nunca crea, borra ni restaura nada) y, si se configura `ADMIN_CHANNEL_ID`, avisa en ese canal privado **solo cuando algo falla**:

- la última copia tiene más de `BACKUP_MAX_AGE_HOURS` horas (26 por defecto),
- no hay ninguna copia,
- una copia nueva pesa menos de la mitad que la anterior (posible copia incompleta),
- no se puede leer la carpeta.

Y una vez más cuando se recupera. Pensado para el formato de [itzg/mc-backup](https://github.com/itzg/docker-mc-backup) (`world-AAAAMMDD-HHMMSS.tar.gz`).

### Heraldo del servidor de Discord

Skald también hace de heraldo, sin bots de terceros:

- 📯 **Bienvenida** en un canal, mencionando solo al recién llegado y enlazando a las normas.
- 🌫️ **Despedida** cuando alguien se va, y 💎 **aviso de boosts**.
- ✉️ **Mensaje privado** al entrar con el enlace a las normas. Si el usuario tiene los privados cerrados, no pasa nada.
- 🧭 **Rol automático** al entrar (`AUTO_ROLE_ID`). Es el único rol que Skald puede dar, y nunca lo quita.
- 📜 **Mensaje de normas** (las «runas») en su canal: normas, guía de canales y cómo entrar al servidor de Minecraft. Si el texto cambia en `src/util/texts.ts`, al desplegar Skald **edita su propio mensaje** en vez de publicar otro.

Necesita el *Server Members Intent* activado en el portal de desarrolladores (pestaña *Bot*). Skald solo lo pide si hay algo del heraldo configurado. Para el rol automático hace falta «Gestionar roles», y que el rol de Skald esté por encima del que va a dar. Para editar las normas, «Leer el historial de mensajes» en ese canal. Conviene desactivar los mensajes del sistema de Discord para que no salgan duplicados.

### Canto del domingo

Cada domingo a las 20:00 (hora de `TIMEZONE`), Skald publica en el canal de los logros un resumen de la semana: horas jugadas entre todos y quién más, el más fiero, el que más picó y más anduvo, las muertes y el más desgraciado, los logros nuevos y los primeros del reino, el más rico de la semana y un dato curioso. Para ello guarda una foto semanal de las estadísticas en su base de datos (la primera vez solo hace la foto). Si estaba apagado a esa hora, lo canta al volver; si la era está en pausa por un mundo nuevo, no canta.

### Registro de administración

Con `ADMIN_CHANNEL_ID`, Skald deja en ese canal un registro de lo importante, agrupado si pasan varias cosas seguidas:

- **En el juego** (desde el log): cambios de modo de juego, op/deop, destierros y su levantamiento, expulsiones y lista blanca, con quién lo hizo (un jugador, la consola o RCON). Los textos se reconocen con las plantillas oficiales del juego. Nunca enseña los baneos de IP.
- **En Discord**: los cambios de roles de un miembro, salvo los que hace Skald solo (rol de entrada y de jugador) y los que gestiona Discord (boost). Si Skald tiene el permiso *Ver registro de auditoría*, dice también quién los cambió. Necesita el intent de miembros (el mismo del heraldo).

### Aviso de lag

Con `ADMIN_CHANNEL_ID`, Skald consulta los TPS cada minuto y avisa en ese canal si el servidor lleva unos minutos por debajo de 15 TPS (no por un pico suelto), con una pista para buscar la causa con spark; y otra vez cuando se recupera. No avisa de caídas (para eso está la monitorización) ni de `/tick freeze` o `/tick sprint`.

### Temporadas (eras)

Cada mundo es una **temporada**. Los primeros del reino, los hitos y las monedas ganadas se apuntan con la temporada en la que pasaron, así que un mundo nuevo empieza con todo por estrenar. Skald nunca cambia de temporada solo: si el `level-name` del servidor deja de coincidir con el de la temporada abierta, lo avisa en el canal de administración, con un botón **«Abrir era nueva»** que pide el nombre, y deja esas cuentas en pausa hasta que un administrador (`ADMIN_USER_IDS`) la abra (con el botón o con `/temporada nueva`). La era nueva se anuncia en los canales de avisos con su imagen y el resumen de la anterior. Al cerrarse, la temporada guarda su ranking final, que se ve en `/temporada historial`.

### Economía

Con `ECONOMY_ENABLED=true`, los jugadores ganan **monedas de plata** jugando. Skald las calcula cada ~5 minutos comparando sus estadísticas con lo ya contado:

| Categoría | Una moneda por | Tope diario |
|---|---|---|
| ⏳ Tiempo activo | 10 min | 60 |
| ⚔️ Enemigos abatidos | 5 | 40 |
| ⛏️ Bloques picados | 50 | 40 |
| 🧭 Distancia | 1 km | 30 |

- El tiempo solo cuenta si en el mismo rato hubo otra actividad (contra el AFK).
- Lo jugado antes de activar la economía no se paga: la primera vez solo se apunta desde dónde se empieza a contar.
- Las monedas son de la persona (su UUID de Minecraft) y se conservan entre temporadas. Todo movimiento queda en un libro que solo crece.
- «El día» de los topes va por `TIMEZONE`.
- **Regalo inicial** por lo jugado antes de activar la economía: `/regalo vista` (solo administradores, solo lo ve quien lo usa) enseña lo que tocaría a cada uno sin pagar nada, y `/regalo aplicar` lo reparte una sola vez. Tasa más baja que la normal (1 moneda cada 30 min, 10 enemigos, 100 bloques o 2 km) y tope de 500, porque ese tiempo incluye AFK. Quien aparezca después lo recibe al llegar.

### Unión al reino (Discord ↔ Minecraft)

Con `PLAYER_ROLE_ID` (el rol de quien juega), el mensaje de las runas lleva un botón **📜 Acepto las runas**. Al pulsarlo, un formulario pide el nombre de Minecraft; Skald lo busca en la API pública de Mojang, enseña la cuenta encontrada y pide confirmación (todo en mensajes que solo ve esa persona). Una cuenta de Discord solo puede unirse a una de Minecraft, y al revés.

- Si esa cuenta ya ha jugado en el servidor, recibe el rol al momento; si no, **en cuanto entre por primera vez** (Skald lo ve en el log), con un mensaje privado de bienvenida.
- Al recibirlo pierde el rol automático (`AUTO_ROLE_ID`). Skald solo toca esos dos roles, y su rol debe estar por encima de ambos.
- Quien vuelve al servidor de Discord y ya estaba unido recupera su rol directamente.
- Cada unión se avisa en el canal de administración (también los intentos con una cuenta ya unida a otra persona).
- `/vincular @persona nombre` y `/desvincular @persona` (solo administradores) para unir a quien ya jugaba o arreglar un nombre equivocado. Desvincular no toca los roles.

- **Inactividad**: quien lleva `INACTIVITY_DAYS` días (30 por defecto) sin entrar al servidor vuelve al rol automático, con un único mensaje privado (si los tiene cerrados, se dice en el canal de administración), y lo recupera solo en cuanto vuelve a entrar. La última conexión sale del log (o, si no hay, de la fecha de sus estadísticas). Los administradores nunca caducan, y si nadie ha entrado en una semana (servidor parado, vacaciones) no se toca a nadie.

Mojang confirma que la cuenta existe, no que sea de quien la reclama: lo que da el rol es que esa cuenta entre de verdad al servidor.

### Skald en el chat del juego

Con `GAME_CHAT_ENABLED=true`, Skald también habla y escucha en el chat de Minecraft, sin cuenta de Minecraft ni jugador falso (no aparece en la lista de conectados):

- **Saluda** a quien entra al servidor con un único mensaje (solo lo ve esa persona): su cabeza, quién más está conectado y, si está unido al reino, sus monedas y un `!ayuda` que se puede pulsar; si no, cómo unirse. Suena un cuerno, solo para él. No repite el saludo si se reconecta enseguida.
- **Habla** con `tellraw` por RCON, siempre con la misma plantilla cerrada: el texto va dentro de un componente JSON, sin caracteres de control ni códigos de formato, así que nada de lo que escriba un jugador puede convertirse en otro comando. Anuncia las quedadas nuevas y su aviso de 30 minutos.
- **Escucha** el log: los mensajes que empiezan por `!` son comandos, solo para quien está unido al reino (salvo `!ayuda`), con un límite de un comando cada pocos segundos y de tres creaciones por hora:

| Comando | Qué hace |
|---|---|
| `!ayuda` | Lista de comandos |
| `!tesoro` | Tus monedas de plata |
| `!cielo` | Hora, día, fase de la luna y clima (también sin unirse al reino) |
| `!tareas` | Las misiones de hoy y tu progreso |
| `!recordar <cuándo> \| <texto>` | Recordatorio por Discord (también sin barra: `!recordar 2h regar`) |
| `!quedada <cuándo> \| <título>` | Crea la quedada en Discord, como `/quedada` |
| `!encuesta <pregunta> \| <opción> \| <opción>…` | Encuesta en Discord |

Lo creado desde el juego se publica en `GAME_CHAT_CHANNEL_ID` (o en el primer canal de `COMMAND_CHANNEL_IDS`). Las respuestas solo las ve quien escribió el comando.

### Panel del reino

Con `PANEL_CHANNEL_ID`, Skald mantiene en ese canal **un único mensaje** con el estado del reino: guerreros conectados, TPS y tiempo por tick, versión, era actual y última copia de seguridad, con una portada en pixel art que cambia según el estado (despierto, vacío, con lag o caído). Lo revisa cada minuto y solo lo edita si algo ha cambiado; lo reconoce por el pie, así que tras un reinicio sigue editando el mismo. Necesita *Ver canal*, *Enviar mensajes*, *Insertar enlaces*, *Adjuntar archivos* y *Leer el historial de mensajes*; conviene que nadie más pueda escribir en ese canal.

### Quedadas, encuestas y recordatorios

Para organizar el reino desde cualquier canal (las respuestas solo las ve quien usa el comando; lo público se publica aparte):

- `/quedada` crea un **evento programado de Discord** con portada propia y lo anuncia en el canal con su tarjeta (botón «Interesado»). 30 minutos antes, Skald avisa en ese canal mencionando a quienes marcaron «Interesado». Necesita el permiso «Crear eventos» (o «Gestionar eventos»).
- `/encuesta` usa las encuestas nativas de Discord; necesita «Crear encuestas» en el canal.
- `/recordatorio` guarda los recordatorios en la base de datos: sobreviven a los reinicios (lo que venció con Skald apagado llega con una nota de retraso). Por privado; si los tiene cerrados, en el canal donde se pidió, mencionando solo a esa persona. Máximo 25 pendientes por persona y un año de antelación.

Las fechas se escriben a mano en la zona horaria de `TIMEZONE`.

### Tareas diarias

Cada día (según `TIMEZONE`) hay tres misiones, las mismas para todos: una fácil, una media y una difícil, sorteadas de una lista fija (abatir enemigos concretos, picar menas, talar, recorrer kilómetros, pescar, comerciar…). El progreso es lo que suben tus estadísticas ese día. Cada misión cumplida da monedas (15, 30 o 50) y cumplir las tres suma un día de racha con un extra (10 monedas por día de racha, hasta 70). Si el chat del juego está activo, Skald te avisa en privado al cumplirlas. Se consultan con `/tareas` y `!tareas`. Sin economía, solo se ve el progreso.

### Comandos solo en ciertos canales

Con `COMMAND_CHANNEL_IDS`, Skald solo responde a los comandos en esos canales (y en sus hilos). En el resto contesta, solo a quien lo usó, dónde encontrarlo. El canal de administración (`ADMIN_CHANNEL_ID`) siempre está permitido, para pruebas, y los comandos que solo ve quien los usa (como `/ayuda`) funcionan en cualquier canal. Para que ni siquiera aparezcan en otros canales, Discord permite restringirlos en *Ajustes del servidor → Integraciones → Skald*.

## Diseño y seguridad

- **Solo lectura.** Skald consulta, no administra. Las estadísticas salen de los ficheros del mundo (`players/stats` y `players/advancements`), montados en solo lectura. Lo que recuerda (temporadas, primeros del reino, hitos, monedas) lo guarda en una base de datos SQLite (`node:sqlite`, sin dependencias nativas) en `STATE_DIR` (en Docker, la carpeta `state/` junto al compose), con una copia diaria en `STATE_DIR/backups` (se guardan 7); la configuración rechaza que esté dentro del mundo. Esa carpeta no la cubren las copias del servidor de Minecraft: conviene incluirla en una copia fuera de la máquina.
- **Lista cerrada de comandos RCON** (`list`, `tick query`, `version`, `time query time`, y `tellraw` y `playsound` con plantillas cerradas si el chat del juego está activo). El cliente RCON no expone ninguna forma de enviar texto arbitrario, así que nada de lo que se escriba en Discord llega a la consola del servidor.
- **Sin menciones.** Todas las respuestas se envían con `allowedMentions: { parse: [] }`, y el texto que viene del servidor (MOTD, nombres) se escapa.
- **Configuración validada al arrancar.** Si falta una variable obligatoria, el bot no arranca, y los errores nunca muestran valores (pueden ser secretos).
- **Separación núcleo / temática.** `src/core/` habla con el servidor y no sabe nada de Discord ni del tono; los textos están en `src/util/texts.ts`.

```
src/
  index.ts          arranque y enrutado de comandos
  register.ts       registro de comandos slash (se lanza a mano)
  config.ts         variables de entorno validadas con zod
  presence.ts       presencia rotativa
  core/             ping, RCON, lectura del mundo, métricas, nombres y textos
  adapters/         lo específico de cada cargador (vanilla por ahora)
  commands/         un fichero por comando slash
  util/             textos, embeds, escape, logs
test/
  fixtures/         respuestas reales de RCON capturadas de un servidor 26.2
  local-server/     servidor de Minecraft desechable para pruebas
```

## Puesta en marcha

### Requisitos

- Node.js 24 LTS y [pnpm](https://pnpm.io) (versión fijada en `package.json`).
- Un servidor de Minecraft Java con RCON activado.
- Una aplicación de Discord con bot ([portal de desarrolladores](https://discord.com/developers/applications)). No necesita ningún *privileged intent*.

### Configuración

```bash
pnpm install
cp .env.example .env
chmod 600 .env
```

Rellena `.env`:

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DISCORD_TOKEN` | Sí | Token del bot |
| `DISCORD_GUILD_ID` | Sí | ID del servidor de Discord donde se registran los comandos |
| `RCON_PASSWORD` | Sí | Contraseña RCON del servidor de Minecraft |
| `MC_HOST`, `MC_PORT` | No | Host y puerto del juego (por defecto `minecraft:25565`) |
| `RCON_HOST`, `RCON_PORT` | No | Host y puerto RCON (por defecto `minecraft:25575`) |
| `BLUEMAP_URL` | No | Enlace para `/mapa` |
| `DATA_DIR` | No | Carpeta `data` del servidor (por defecto `/data`, la del contenedor) |
| `ALERT_CHANNEL_ID` | No | Canal de avisos |
| `ALERT_EVENTS` | No | Qué avisar: `join,leave,death,advancement,server` (por defecto, todo) |
| `ALERT_CHANNEL_JOIN`, `_LEAVE`, `_DEATH`, `_ADVANCEMENT`, `_SERVER` | No | Canal propio para un tipo de aviso |
| `COMMAND_CHANNEL_IDS` | No | Canales donde se pueden usar los comandos, separados por comas (vacío = todos) |
| `ADMIN_USER_IDS` | No | IDs de administradores, separados por comas. El primero aparece en las normas como contacto |
| `ADMIN_CHANNEL_ID` | No | Canal privado de administración (avisos de copias) |
| `BACKUP_MAX_AGE_HOURS` | No | Horas sin copia nueva antes de avisar (por defecto 26) |
| `BACKUPS_DIR` | No | Carpeta de copias (por defecto `/backups`, la del contenedor) |
| `STATE_DIR` | No | Estado propio de Skald, lo único que escribe (por defecto `/state`; nunca dentro de `DATA_DIR`) |
| `INACTIVITY_DAYS` | No | Días sin entrar antes de volver al rol automático (por defecto 30; 0 = nunca) |
| `PLAYER_ROLE_ID` | No | Rol de quien juega; activa la unión al reino (botón en las runas, `/vincular`) |
| `GAME_CHAT_ENABLED` | No | `true` para que Skald hable y escuche en el chat del juego (por defecto `false`) |
| `GAME_CHAT_CHANNEL_ID` | No | Canal de las quedadas y encuestas creadas desde el juego |
| `PANEL_CHANNEL_ID` | No | Canal del panel del reino (un mensaje fijo que Skald mantiene al día) |
| `TIMEZONE` | No | Zona horaria de «el día» para los topes de monedas (por defecto `UTC`, p. ej. `Europe/Madrid`) |
| `ECONOMY_ENABLED` | No | `true` para activar las monedas (por defecto `false`) |
| `HERALD_CHANNEL_ID` | No | Canal de bienvenidas, despedidas y boosts |
| `RULES_CHANNEL_ID` | No | Canal de normas, donde Skald mantiene su mensaje |
| `AUTO_ROLE_ID` | No | Rol que se da automáticamente al entrar |
| `MC_PUBLIC_ADDRESS` | No | Dirección del servidor de Minecraft que se muestra en las normas |
| `LOG_LEVEL` | No | `debug`, `info`, `warn` o `error` |

Los valores por defecto de los hosts (`minecraft`) son los de un despliegue en el mismo Docker Compose que el servidor.

### Registrar los comandos y arrancar

```bash
pnpm register   # cada vez que se añade o cambia un comando
pnpm dev        # desarrollo, con recarga
```

Sin Docker:

```bash
pnpm build
pnpm start
```

## Despliegue con Docker

Cada push a `main` que pasa las comprobaciones publica la imagen en GHCR:

- `ghcr.io/guillermosh/skald-bot:latest`
- `ghcr.io/guillermosh/skald-bot:sha-<commit>` (para fijar o volver a una versión concreta)

`deploy/compose.yaml` es un stack independiente que se coloca junto al del servidor de Minecraft. No toca ese stack: se une a su red para llegar a RCON (sin publicar puertos) y monta `data/` y `backups/` en **solo lectura**; su estado (base de datos SQLite) va en la carpeta `state/` junto al compose, que hay que crear antes con el usuario de UID 1000 (`mkdir state`). El contenedor corre como usuario sin privilegios (UID 1000), con el sistema de ficheros en solo lectura y sin *capabilities*.

```
/opt/stacks/
  minecraft/     compose del servidor, con data/ y backups/
  skald/
    compose.yaml   (copia de deploy/compose.yaml)
    .env           (permisos 600)
```

```bash
cd /opt/stacks/skald
docker compose pull
docker compose up -d
docker compose logs -f
```

Variables opcionales del stack (en el `.env` o en el entorno): `MINECRAFT_DIR` (por defecto `../minecraft`), `MINECRAFT_NETWORK` (por defecto `minecraft_default`) y `SKALD_TAG` (por defecto `latest`).

Para registrar o actualizar los comandos slash desde el servidor:

```bash
docker compose run --rm skald node dist/register.js
```

> No ejecutes a la vez una copia local (`pnpm dev`) y la de producción con el mismo token: las dos intentarían responder a cada comando.

### Actualización automática

`deploy/systemd/` trae un temporizador que cada 5 minutos descarga la imagen y recrea el contenedor solo si ha cambiado. Es una plantilla: el texto tras la `@` es el usuario que lo ejecuta, que debe estar en el grupo `docker`.

```bash
sudo cp deploy/systemd/skald-update@.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now skald-update@TU_USUARIO.timer
systemctl list-timers 'skald-update*'
```

Nadie empuja nada al servidor: es él quien comprueba si hay versión nueva. Para fijar una versión, pon `SKALD_TAG=sha-<commit>` en el `.env` del stack.

## Desarrollo

```bash
pnpm typecheck
pnpm lint
pnpm test
```

### Servidor de pruebas local

`test/local-server/` levanta un servidor vanilla desechable (mundo plano, puertos solo en `127.0.0.1`). Al arrancarlo aceptas la [EULA de Minecraft](https://aka.ms/MinecraftEULA).

```bash
docker compose -f test/local-server/compose.yaml up -d
pnpm smoke      # ping y comandos RCON sin pasar por Discord
docker compose -f test/local-server/compose.yaml down -v   # lo borra todo
```

Para probar el bot contra él, en `.env`: `MC_HOST=127.0.0.1`, `RCON_HOST=127.0.0.1` y `RCON_PASSWORD=skald-local`.

Las estadísticas (`/gestas`, `/cronica`) se pueden probar con los datos sintéticos de `test/fixtures/data` poniendo `DATA_DIR=./test/fixtures/data`.

### Imágenes

Las imágenes en pixel art de bienvenida, despedida, boosts y normas son diseño propio, dibujadas por código con Pillow (`scripts/art/generate.py`). Solo hace falta para regenerarlas; el bot no usa Python:

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/art/requirements.txt
pnpm art   # escribe assets/*.gif y assets/runas.png
```

### Fuentes externas

- **Nombres en español** de logros, mobs y bloques: se descargan al arrancar de los servidores de recursos de Mojang, para la versión del servidor. Si no hay red, se muestran los ids en formato legible.
- **Nombres de jugador** que ya no están en `usercache.json` (caducan a los 30 días): API pública de perfiles de Mojang.
- **Cabezas de jugador** en `/cronica` y `/duelo`: [mc-heads.net](https://mc-heads.net).

### Cuando sale una versión nueva de Minecraft

Los parsers de `src/core/parsers.ts` dependen del texto que devuelve el servidor por RCON, que a veces cambia entre versiones. Para comprobarlo, cambia `VERSION` en `test/local-server/compose.yaml`, ejecuta `pnpm smoke` y, si algo ha cambiado, añade las respuestas nuevas a `test/fixtures/`. Si el formato no se reconoce, el bot lo dice en Discord y lo anota en el log en vez de mostrar datos falsos.

## Hoja de ruta

- [x] Consultas básicas: estado, jugadores, datos técnicos, mapa, presencia
- [x] Imagen Docker, despliegue junto al servidor (Compose) y actualización automática
- [x] Estadísticas y rankings a partir de los ficheros del mundo
- [x] Avisos en un canal: entradas, salidas, muertes y logros
- [x] Heraldo: bienvenidas, despedidas, boosts, rol automático y normas
- [x] Estado de las copias de seguridad
- [ ] Adaptadores para servidores con mods

## Licencia

Proyecto personal. El código es público para leerlo, pero **todos los derechos están reservados**:
no se permite copiarlo, modificarlo, distribuirlo ni desplegarlo sin permiso del autor. Ver
[`LICENSE`](LICENSE).
