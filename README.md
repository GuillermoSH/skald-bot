# Skald

Bot de Discord para un servidor de Minecraft Java. Skald, el bardo del reino, canta las crónicas del mundo: quién está conectado, cómo va el servidor y dónde está el mapa.

Pensado para servidores **vanilla**, con una capa de adaptadores para dar soporte más adelante a Fabric, Forge, NeoForge o Paper sin tocar el núcleo.

> Probado con Minecraft Java **26.2** (vanilla).

## Comandos

| Comando | Qué hace |
|---|---|
| `/reino` | Estado del reino: jugadores, TPS, tiempo por tick, latencia y versión |
| `/guerreros` | Quién está conectado ahora mismo |
| `/runas` | Versión, cargador y datos técnicos del servidor |
| `/mapa` | Enlace al mapa web (BlueMap), si está configurado |
| `/ayuda` | Lista de comandos (solo la ve quien la pide) |

Además, el bot muestra un estado personalizado según cómo esté el servidor:

| Situación | Estado | Texto |
|---|---|---|
| Con jugadores | En línea | ⚔️ *n* guerreros en el reino |
| Vacío | Ausente | 🌙 Silencio en las salas |
| Caído | No molestar | 💤 El reino duerme (offline) |

## Diseño y seguridad

- **Solo lectura.** Skald consulta, no administra.
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
  core/             ping de estado, cliente RCON y parsers de sus respuestas
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
| `ALERT_CHANNEL_ID` | No | Canal de avisos (próximamente) |
| `ADMIN_USER_IDS` | No | IDs de administradores, separados por comas |
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

`deploy/compose.yaml` es un stack independiente que se coloca junto al del servidor de Minecraft. No toca ese stack: se une a su red para llegar a RCON (sin publicar puertos) y monta `data/` y `backups/` en **solo lectura**. El contenedor corre como usuario sin privilegios (UID 1000), con el sistema de ficheros en solo lectura y sin *capabilities*.

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

### Cuando sale una versión nueva de Minecraft

Los parsers de `src/core/parsers.ts` dependen del texto que devuelve el servidor por RCON, que a veces cambia entre versiones. Para comprobarlo, cambia `VERSION` en `test/local-server/compose.yaml`, ejecuta `pnpm smoke` y, si algo ha cambiado, añade las respuestas nuevas a `test/fixtures/`. Si el formato no se reconoce, el bot lo dice en Discord y lo anota en el log en vez de mostrar datos falsos.

## Hoja de ruta

- [x] Consultas básicas: estado, jugadores, datos técnicos, mapa, presencia
- [x] Imagen Docker, despliegue junto al servidor (Compose) y actualización automática
- [ ] Estadísticas y rankings a partir de los ficheros del mundo
- [ ] Avisos en un canal: entradas, salidas, muertes y logros
- [ ] Estado de las copias de seguridad
- [ ] Adaptadores para servidores con mods
