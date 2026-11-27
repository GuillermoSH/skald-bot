# Plantilla de mundo (servidor de Minecraft)

Todo lo que define cómo es el mundo va **declarado en el `compose.yaml` del servidor**
(`itzg/minecraft-server`), no a mano: al arrancar, la imagen descarga los mods y los datapacks y
aplica las gamerules. Un mundo nuevo (otro `LEVEL`) sale igual, sin pasos que olvidar.

Fragmento para el servicio `minecraft` (se suma al resto de su configuración):

```yaml
    environment:
      VERSION: "26.2"
      TYPE: FABRIC
      # Mods solo de servidor (los jugadores entran con el cliente vanilla).
      MODRINTH_PROJECTS: |
        fabric-api
        lithium
        ferrite-core
        servercore
        chunky
        spark
        styled-chat
        styledplayerlist
      # Datapacks de Vanilla Tweaks (lista en vanillatweaks.json; los descarga por versión).
      VANILLATWEAKS_FILE: /extras/vanillatweaks.json
      # Gamerules, en cada arranque. Ojo: en 26.x se llaman en snake_case.
      RCON_CMDS_STARTUP: |-
        gamerule players_sleeping_percentage 50
    volumes:
      - ./vanillatweaks.json:/extras/vanillatweaks.json:ro
```

`vanillatweaks.json` va junto al `compose.yaml` del servidor. Los nombres de los packs son los de
<https://vanillatweaks.net> en minúsculas, agrupados por su categoría (`informative`,
`gameplay changes`, `decorative/cosmetic`…).

Probado en el servidor de pruebas (`test/local-server/compose.template.yaml`): el datapack se
descarga y se carga solo, y la gamerule queda aplicada.

Notas:
- Los datapacks se instalan dentro del mundo (`world/datapacks/`).
- No cambies los mensajes de entrada, salida, muerte ni logros (Styled Chat, datapacks): Skald los
  lee del log.
