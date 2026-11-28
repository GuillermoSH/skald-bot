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
      # En cada arranque: gamerules (ojo: en 26.x en snake_case) y los marcadores de las
      # misiones en vivo de Skald (si ya existen, el servidor solo dice que ya están).
      RCON_CMDS_STARTUP: |-
        gamerule players_sleeping_percentage 50
        scoreboard objectives add sk.c.mob_kills minecraft.custom:minecraft.mob_kills
        scoreboard objectives add sk.m.stone minecraft.mined:minecraft.stone
        scoreboard objectives add sk.m.deepslate minecraft.mined:minecraft.deepslate
        scoreboard objectives add sk.m.dirt minecraft.mined:minecraft.dirt
        scoreboard objectives add sk.m.grass_block minecraft.mined:minecraft.grass_block
        scoreboard objectives add sk.m.netherrack minecraft.mined:minecraft.netherrack
        scoreboard objectives add sk.m.gravel minecraft.mined:minecraft.gravel
        scoreboard objectives add sk.m.sand minecraft.mined:minecraft.sand
        scoreboard objectives add sk.m.tuff minecraft.mined:minecraft.tuff
        scoreboard objectives add sk.m.granite minecraft.mined:minecraft.granite
        scoreboard objectives add sk.m.diorite minecraft.mined:minecraft.diorite
        scoreboard objectives add sk.m.andesite minecraft.mined:minecraft.andesite
        scoreboard objectives add sk.m.end_stone minecraft.mined:minecraft.end_stone
        scoreboard objectives add sk.c.walk_one_cm minecraft.custom:minecraft.walk_one_cm
        scoreboard objectives add sk.c.sprint_one_cm minecraft.custom:minecraft.sprint_one_cm
        scoreboard objectives add sk.c.crouch_one_cm minecraft.custom:minecraft.crouch_one_cm
        scoreboard objectives add sk.c.swim_one_cm minecraft.custom:minecraft.swim_one_cm
        scoreboard objectives add sk.c.walk_on_water_one_cm minecraft.custom:minecraft.walk_on_water_one_cm
        scoreboard objectives add sk.c.walk_under_water_one_cm minecraft.custom:minecraft.walk_under_water_one_cm
        scoreboard objectives add sk.c.climb_one_cm minecraft.custom:minecraft.climb_one_cm
        scoreboard objectives add sk.c.boat_one_cm minecraft.custom:minecraft.boat_one_cm
        scoreboard objectives add sk.c.horse_one_cm minecraft.custom:minecraft.horse_one_cm
        scoreboard objectives add sk.c.aviate_one_cm minecraft.custom:minecraft.aviate_one_cm
        scoreboard objectives add sk.c.minecart_one_cm minecraft.custom:minecraft.minecart_one_cm
        scoreboard objectives add sk.c.fly_one_cm minecraft.custom:minecraft.fly_one_cm
        scoreboard objectives add sk.c.fish_caught minecraft.custom:minecraft.fish_caught
        scoreboard objectives add sk.c.animals_bred minecraft.custom:minecraft.animals_bred
        scoreboard objectives add sk.k.spider minecraft.killed:minecraft.spider
        scoreboard objectives add sk.k.zombified_piglin minecraft.killed:minecraft.zombified_piglin
        scoreboard objectives add sk.k.zombie minecraft.killed:minecraft.zombie
        scoreboard objectives add sk.k.skeleton minecraft.killed:minecraft.skeleton
        scoreboard objectives add sk.m.oak_log minecraft.mined:minecraft.oak_log
        scoreboard objectives add sk.m.spruce_log minecraft.mined:minecraft.spruce_log
        scoreboard objectives add sk.m.birch_log minecraft.mined:minecraft.birch_log
        scoreboard objectives add sk.m.jungle_log minecraft.mined:minecraft.jungle_log
        scoreboard objectives add sk.m.acacia_log minecraft.mined:minecraft.acacia_log
        scoreboard objectives add sk.m.dark_oak_log minecraft.mined:minecraft.dark_oak_log
        scoreboard objectives add sk.m.mangrove_log minecraft.mined:minecraft.mangrove_log
        scoreboard objectives add sk.m.cherry_log minecraft.mined:minecraft.cherry_log
        scoreboard objectives add sk.m.pale_oak_log minecraft.mined:minecraft.pale_oak_log
        scoreboard objectives add sk.m.crimson_stem minecraft.mined:minecraft.crimson_stem
        scoreboard objectives add sk.m.warped_stem minecraft.mined:minecraft.warped_stem
        scoreboard objectives add sk.m.iron_ore minecraft.mined:minecraft.iron_ore
        scoreboard objectives add sk.m.deepslate_iron_ore minecraft.mined:minecraft.deepslate_iron_ore
        scoreboard objectives add sk.c.traded_with_villager minecraft.custom:minecraft.traded_with_villager
        scoreboard objectives add sk.k.blaze minecraft.killed:minecraft.blaze
        scoreboard objectives add sk.m.nether_quartz_ore minecraft.mined:minecraft.nether_quartz_ore
        scoreboard objectives add sk.k.creeper minecraft.killed:minecraft.creeper
        scoreboard objectives add sk.k.enderman minecraft.killed:minecraft.enderman
        scoreboard objectives add sk.m.diamond_ore minecraft.mined:minecraft.diamond_ore
        scoreboard objectives add sk.m.deepslate_diamond_ore minecraft.mined:minecraft.deepslate_diamond_ore
        scoreboard objectives add sk.m.ancient_debris minecraft.mined:minecraft.ancient_debris
        scoreboard objectives add sk.k.wither_skeleton minecraft.killed:minecraft.wither_skeleton
        scoreboard objectives add sk.k.shulker minecraft.killed:minecraft.shulker
    volumes:
      - ./vanillatweaks.json:/extras/vanillatweaks.json:ro
```

`vanillatweaks.json` va junto al `compose.yaml` del servidor. Los nombres de los packs son los de
<https://vanillatweaks.net> en minúsculas, agrupados por su categoría (`informative`,
`gameplay changes`, `decorative/cosmetic`…).

Probado en el servidor de pruebas (`test/local-server/compose.template.yaml`): el datapack se
descarga y se carga solo, y la gamerule queda aplicada.

### Marcadores de las misiones (`sk.*`)

Los `scoreboard objectives add sk.…` de arriba crean marcadores que suben en el momento con cada
estadística (mobs, bloques, distancia…). Skald los lee por RCON (`scoreboard players list
<jugador>`, solo lectura) cada 20 s para los conectados, y así las misiones se cumplen a los pocos
segundos en vez de al siguiente autoguardado (~5 min). Sin ellos, Skald funciona igual, solo más
lento. No se ven en pantalla (no tienen `setdisplay`). La lista sale del código
(`liveTerms()` en `src/core/tasks.ts`); un test comprueba que este README la tiene entera: si se
añade una misión con estadísticas nuevas, hay que copiar aquí sus líneas y al compose del servidor.

Notas:
- Los datapacks se instalan dentro del mundo (`world/datapacks/`).
- No cambies los mensajes de entrada, salida, muerte ni logros (Styled Chat, datapacks): Skald los
  lee del log.
