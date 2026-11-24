# Skald

Bot de Discord para un servidor de Minecraft Java. Skald, el bardo del reino, canta las crónicas del mundo: quién está conectado, cómo va el servidor y dónde está el mapa.

Pensado para servidores **vanilla**, con una capa de adaptadores para dar soporte más adelante a Fabric, Forge, NeoForge o Paper sin tocar el núcleo.

> Probado con Minecraft Java **26.2** (vanilla).

## Comandos

| Comando | Qué hace |
|---|---|
| `/reino` | Estado del reino: jugadores, TPS, tiempo por tick, latencia y versión |
| `/guerreros` | Quién está conectado ahora mismo |
| `/gestas <categoría>` | Rankings: tiempo jugado, muertes, mobs, distancia… y otros menos serios (pasto de creepers, muertes tontas, lanzahuevos, rage quit…) |
| `/cronica <guerrero>` | Ficha de un jugador: horas, muertes y su verdugo, presa favorita, bloque más picado, distancia y últimos logros |
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

### Comandos solo en ciertos canales

Con `COMMAND_CHANNEL_IDS`, Skald solo responde a los comandos en esos canales (y en sus hilos). En el resto contesta, solo a quien lo usó, dónde encontrarlo. El canal de administración (`ADMIN_CHANNEL_ID`) siempre está permitido, para pruebas, y los comandos que solo ve quien los usa (como `/ayuda`) funcionan en cualquier canal. Para que ni siquiera aparezcan en otros canales, Discord permite restringirlos en *Ajustes del servidor → Integraciones → Skald*.

## Diseño y seguridad

- **Solo lectura.** Skald consulta, no administra. Las estadísticas salen de los ficheros del mundo (`players/stats` y `players/advancements`), montados en solo lectura. Lo poco que recuerda (los primeros del reino) lo guarda en `STATE_DIR`, un volumen propio; la configuración rechaza que esté dentro del mundo.
- **Lista cerrada de comandos RCON** (`list`, `tick query`, `version`). El cliente RCON no expone ninguna forma de enviar texto arbitrario, así que nada de lo que se escriba en Discord llega a la consola del servidor.
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

`deploy/compose.yaml` es un stack independiente que se coloca junto al del servidor de Minecraft. No toca ese stack: se une a su red para llegar a RCON (sin publicar puertos) y monta `data/` y `backups/` en **solo lectura**; su estado va en un volumen de Docker propio (`skald_state`). El contenedor corre como usuario sin privilegios (UID 1000), con el sistema de ficheros en solo lectura y sin *capabilities*.

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
- **Cabezas de jugador** en `/cronica`: [mc-heads.net](https://mc-heads.net).

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
