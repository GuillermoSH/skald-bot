import {
  ActionRowBuilder,
  Client,
  type ButtonBuilder,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { AlertQueue, buildAlertRoutes } from "./alerts.js";
import { BackupWatcher } from "./backup-watch.js";
import { isCommandChannelAllowed } from "./commands/guard.js";
import { commandsByName } from "./commands/index.js";
import { handleSeasonButton, handleSeasonModal, isSeasonModal, SEASON_BUTTON_ID, seasonProposalRow } from "./commands/temporada.js";
import type { CommandContext } from "./commands/types.js";
import { ConfigError, loadConfig } from "./config.js";
import { BackupsUnavailableError } from "./core/backups.js";
import { Chronicle } from "./core/chronicle.js";
import { DeathArchive } from "./core/deaths.js";
import { jarEnglishLoader, fetchSpanishLang, Translator } from "./core/lang.js";
import { LogWatcher } from "./core/logwatch.js";
import { NameResolver } from "./core/names.js";
import { RconParseError } from "./core/parsers.js";
import { RconClient, RconUnavailableError } from "./core/rcon.js";
import { Herald, heraldNeedsMembers } from "./herald.js";
import { Realm } from "./realm.js";
import { GameChat } from "./ingame.js";
import { startPanel } from "./panel.js";
import { gameLine } from "./util/game.js";
import { startReminderWatch } from "./reminder-watch.js";
import { Linking, LINK_PREFIX } from "./linking.js";
import { MojangClient } from "./core/mojang.js";
import { publishRules } from "./rules.js";
import { fetchSendableChannel } from "./util/channels.js";
import { baseEmbed, COLORS } from "./util/embeds.js";
import { getServerStatus } from "./core/status.js";
import { WorldDataUnavailableError, WorldStats } from "./core/stats.js";
import { STARTING_PRESENCE, startPresenceLoop } from "./presence.js";
import { safeText } from "./util/escape.js";
import { formatCount } from "./util/format.js";
import { log, setLogLevel } from "./util/log.js";
import { texts } from "./util/texts.js";

// El servidor guarda las estadísticas en cada autoguardado (~5 min).
const REALM_TICK_MS = 5 * 60_000;
const INACTIVITY_CHECK_MS = 60 * 60_000;

function main(): void {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      log.error(error.message);
      process.exit(1);
    }
    throw error;
  }
  setLogLevel(config.LOG_LEVEL);

  const lang = new Translator(
    async () => {
      const status = await getServerStatus(config.MC_HOST, config.MC_PORT, config.RCON_TIMEOUT_MS);
      return status.online ? status.version : null;
    },
    fetchSpanishLang,
    jarEnglishLoader(config.DATA_DIR),
  );
  const world = new WorldStats(config.DATA_DIR);
  const realm = new Realm(
    {
      dataDir: config.DATA_DIR,
      stateDir: config.STATE_DIR,
      timeZone: config.TIMEZONE,
      economy: config.ECONOMY_ENABLED,
      firstSeasonName: texts.temporada.firstName,
    },
    world,
  );
  const ctx: CommandContext = {
    config,
    rcon: new RconClient({
      host: config.RCON_HOST,
      port: config.RCON_PORT,
      password: config.RCON_PASSWORD,
      timeoutMs: config.RCON_TIMEOUT_MS,
    }),
    world,
    names: new NameResolver(config.DATA_DIR),
    lang,
    chronicle: new Chronicle(),
    deaths: new DeathArchive(config.DATA_DIR, lang),
    realm,
    linking: null,
  };

  let alerts: AlertQueue | null = null;
  let gameChat: GameChat | null = null;
  const watcher = new LogWatcher(config.DATA_DIR, ctx.lang, (event, live) => {
    if (live && event.type === "advancement" && event.key && realm.claimFirst(event.key, event.player, event.at)) {
      event = { ...event, first: true };
      log.info(`Primero del reino: ${event.player} → ${event.key}`);
    }
    ctx.chronicle.add(event);
    if (live) alerts?.push(event);
    // Comandos con «!» desde el chat del juego.
    if (live && event.type === "chat" && gameChat) {
      void gameChat.onChat(event.player, event.message).catch((error: unknown) => {
        log.warn(`Chat del juego (${event.player}): ${error instanceof Error ? error.message : String(error)}`);
      });
    }
    // Última conexión de quien sale (para la inactividad).
    if (live && event.type === "leave" && ctx.linking) {
      void ctx.linking.onPlayerLeave(event.player).catch(() => undefined);
    }
    // Saludo en el chat del juego a quien entra.
    if (live && event.type === "join" && gameChat) {
      void gameChat.onJoin(event.player).catch((error: unknown) => {
        log.warn(`Saludo en el juego (${event.player}): ${error instanceof Error ? error.message : String(error)}`);
      });
    }
    // Primer login de alguien unido al reino: pasa a Einherjar.
    if (live && event.type === "join" && ctx.linking && client.isReady()) {
      const ready = client;
      void ctx.linking.onPlayerJoin(ready, event.player).catch((error: unknown) => {
        log.warn(`Unión al reino (entrada de ${event.player}): ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  });

  // Aviso al canal de administración (mundo nuevo sin temporada...). El canal se abre una vez.
  let adminChannel: ReturnType<typeof fetchSendableChannel> | null = null;
  const adminSay = async (message: string, components: ActionRowBuilder<ButtonBuilder>[] = []) => {
    if (!config.ADMIN_CHANNEL_ID) return;
    if (!client.isReady()) return;
    adminChannel ??= fetchSendableChannel(client, config.ADMIN_CHANNEL_ID, "administración");
    const channel = await adminChannel;
    await channel?.send({ embeds: [baseEmbed().setDescription(message)], components, allowedMentions: { parse: [] } });
  };

  // Revisión periódica: temporada, primeros, hitos (al canal de los logros) y monedas.
  const realmTick = async () => {
    try {
      const newWorld = await realm.checkSeason();
      const season = realm.season;
      if (newWorld && season) {
        await adminSay(
          texts.temporada.mismatchAlert(safeText(newWorld, 40), safeText(season.name, 40), safeText(season.levelName, 40)),
          [seasonProposalRow()],
        );
      }
      const { milestones, earnings } = await realm.tick();
      if (earnings.length > 0) log.debug(`Monedas: ${earnings.map((e) => `${e.uuid.slice(0, 8)} +${e.amount} ${e.category}`).join(", ")}`);
      if (milestones.length === 0) return;
      const names = await ctx.names.resolve(milestones.map((c) => c.uuid));
      for (const c of milestones) {
        const player = names.get(c.uuid);
        if (!player) continue;
        log.info(`Hito: ${player} → ${c.id} ${c.threshold}`);
        alerts?.pushLine("advancement", texts.alerts.milestone[c.id](`**${safeText(player, 32)}**`, formatCount(c.threshold)));
      }
    } catch (error) {
      log.warn(`No se pudo revisar el reino (primeros, hitos, monedas): ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  let realmTimer: NodeJS.Timeout | null = null;
  let stopReminders: () => void = () => {};
  let stopPanel: () => void = () => {};
  let inactivityTimer: NodeJS.Timeout | null = null;

  const needsMembers = heraldNeedsMembers(config);
  const client = new Client({
    // GuildMembers es un intent privilegiado: solo se pide si el heraldo está configurado.
    intents: needsMembers ? [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] : [GatewayIntentBits.Guilds],
    // Para enterarse de las salidas de miembros que no estaban en caché.
    partials: [Partials.GuildMember, Partials.User],
    // Nunca mencionar a nadie, venga el texto de donde venga.
    allowedMentions: { parse: [] },
    presence: STARTING_PRESENCE,
  });

  let stopPresence: () => void = () => {};
  client.once(Events.ClientReady, (ready) => {
    log.info(`Conectado a Discord como ${ready.user.tag}`);
    stopPresence = startPresenceLoop(ready, config);
    void startLogWatch(ready);
    void startHerald(ready);
    void startBackupWatch(ready);
  });

  let backupWatcher: BackupWatcher | null = null;
  const startBackupWatch = async (ready: Client<true>) => {
    if (!config.ADMIN_CHANNEL_ID) return;
    const channel = await fetchSendableChannel(ready, config.ADMIN_CHANNEL_ID, "administración");
    if (!channel) return;
    backupWatcher = new BackupWatcher(config.BACKUPS_DIR, config.BACKUP_MAX_AGE_HOURS, async (message, ok) => {
      await channel.send({
        embeds: [baseEmbed(ok ? COLORS.ok : COLORS.error).setDescription(message)],
        allowedMentions: { parse: [] },
      });
    });
    backupWatcher.start();
    log.info("Vigilando las copias de seguridad (avisos en el canal de administración)");
  };

  const startHerald = async (ready: Client<true>) => {
    try {
      // Quien vuelve al Discord y ya era Einherjar recupera su rol.
      if (needsMembers) await new Herald(config, (id) => ctx.linking?.roleOnJoin(id) ?? config.AUTO_ROLE_ID ?? null).attach(ready);
      if (config.RULES_CHANNEL_ID) {
        const status = await getServerStatus(config.MC_HOST, config.MC_PORT, config.RCON_TIMEOUT_MS);
        await publishRules(ready, config.RULES_CHANNEL_ID, {
          version: status.online ? status.version : null,
          address: config.MC_PUBLIC_ADDRESS ?? null,
          jarlId: config.ADMIN_USER_IDS[0] ?? null,
          linkButton: Boolean(config.PLAYER_ROLE_ID),
        });
      }
    } catch (error) {
      log.error(`Heraldo: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Textos primero (para reconocer muertes y traducir), luego el histórico de primeros, avisos y log.
  const startLogWatch = async (ready: Client<true>) => {
    await ctx.lang.ready();
    // Base de datos y temporada; los primeros del histórico, antes de seguir el log.
    await realm.init();
    const links = realm.links;
    if (config.PLAYER_ROLE_ID && links) {
      ctx.linking = new Linking({ ...config, PLAYER_ROLE_ID: config.PLAYER_ROLE_ID }, links, new MojangClient(), ctx.names, world, (m) => adminSay(m));
      log.info("Unión al reino activa (botón en las runas)");
      if (config.INACTIVITY_DAYS > 0) {
        const linking = ctx.linking;
        const check = () => {
          linking.checkInactivity(ready, config.INACTIVITY_DAYS).catch((error: unknown) => {
            log.warn(`Inactividad: ${error instanceof Error ? error.message : String(error)}`);
          });
        };
        check();
        inactivityTimer = setInterval(check, INACTIVITY_CHECK_MS);
      }
    }
    try {
      const added = await realm.reconcileFirsts();
      if (added > 0) log.info(`Primeros del reino: ${added} logros apuntados del histórico`);
    } catch (error) {
      log.warn(`No se pudieron revisar los primeros del reino: ${error instanceof Error ? error.message : String(error)}`);
    }
    const routes = await buildAlertRoutes(ready, config);
    if (routes.size > 0) {
      alerts = new AlertQueue(routes, {}, (error) => {
        log.warn(`No se pudo enviar un aviso: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
    // Después de las rutas: lo superado con el bot apagado también se avisa.
    // La primera vez, lo ya superado se apunta en silencio (hitos y monedas).
    await realmTick();
    realmTimer = setInterval(() => void realmTick(), REALM_TICK_MS);
    // Recordatorios y avisos de quedadas (necesitan la base de datos).
    const reminders = realm.reminders;
    if (reminders) {
      // Aviso de quedada también en el chat del juego (si está activo).
      const gameSay = config.GAME_CHAT_ENABLED
        ? (title: string) => ctx.rcon.tellraw("@a", gameLine(texts.game.quedadaSoon(title))).catch(() => undefined)
        : null;
      stopReminders = startReminderWatch(ready, reminders, gameSay);
    }
    if (config.GAME_CHAT_ENABLED) {
      gameChat = new GameChat(ctx, ready);
      log.info("Skald escucha el chat del juego (comandos con «!»)");
    }
    // Panel del reino (después de la temporada, para enseñar la era).
    if (config.PANEL_CHANNEL_ID) stopPanel = await startPanel(ready, ctx, config.PANEL_CHANNEL_ID);
    try {
      await watcher.start();
      log.info("Siguiendo el log del servidor");
    } catch (error) {
      log.error(`No se pudo seguir el log: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isChatInputCommand()) void handleCommand(interaction, ctx);
    else if (interaction.isAutocomplete()) void handleAutocomplete(interaction, ctx);
    else if (interaction.isButton() && interaction.customId === SEASON_BUTTON_ID) void handleComponent(interaction, () => handleSeasonButton(interaction, ctx));
    else if (interaction.isModalSubmit() && isSeasonModal(interaction.customId)) void handleComponent(interaction, () => handleSeasonModal(interaction, ctx));
    else if ((interaction.isButton() || interaction.isModalSubmit()) && interaction.customId.startsWith(LINK_PREFIX)) {
      void handleComponent(interaction, async () => {
        if (ctx.linking) await ctx.linking.handle(interaction);
        else await interaction.reply({ content: texts.link.disabled, flags: MessageFlags.Ephemeral });
      });
    }
  });

  const shutdown = (signal: string) => {
    log.info(`Recibido ${signal}, cerrando…`);
    stopPresence();
    watcher.stop();
    backupWatcher?.stop();
    if (realmTimer) clearInterval(realmTimer);
    stopReminders();
    stopPanel();
    if (inactivityTimer) clearInterval(inactivityTimer);
    alerts?.dispose();
    realm.close();
    void client.destroy().finally(() => process.exit(0));
  };
  process.once("SIGINT", () => { shutdown("SIGINT"); });
  process.once("SIGTERM", () => { shutdown("SIGTERM"); });

  client.login(config.DISCORD_TOKEN).catch((error: unknown) => {
    // Sin volcar el error entero: no queremos que el token acabe en un log.
    const message = error instanceof Error ? error.message : "error desconocido";
    log.error(`No se pudo iniciar sesión en Discord: ${message}`);
    if (/disallowed intents/i.test(message)) {
      log.error("Activa «Server Members Intent» en el portal de desarrolladores (pestaña Bot) o quita la configuración del heraldo.");
    }
    process.exit(1);
  });
}

async function handleCommand(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  const command = commandsByName.get(interaction.commandName);
  if (!command) return;

  if (interaction.guildId !== ctx.config.DISCORD_GUILD_ID) {
    await interaction.reply({ content: texts.wrongGuild, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    return;
  }

  // Comandos solo en sus canales (los que solo ve quien los usa, como /ayuda, en cualquiera).
  const parentId = interaction.channel?.isThread() ? interaction.channel.parentId : null;
  if (!command.ephemeral && !isCommandChannelAllowed(ctx.config, interaction.channelId, parentId)) {
    const where = ctx.config.COMMAND_CHANNEL_IDS.map((id) => `<#${id}>`).join(", ");
    await interaction.reply({ content: texts.wrongChannel(where), flags: MessageFlags.Ephemeral }).catch(() => undefined);
    return;
  }

  log.info(`/${interaction.commandName} por ${interaction.user.id}`);
  try {
    // RCON puede tardar más de los 3 s que da Discord para contestar.
    await interaction.deferReply(command.ephemeral ? { flags: MessageFlags.Ephemeral } : {});
    await command.execute(interaction, ctx);
  } catch (error) {
    let message: string = texts.ravensSilent;
    if (error instanceof RconUnavailableError) {
      const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
      log.warn(`/${interaction.commandName}: ${error.message}${cause}`);
    } else if (error instanceof RconParseError) {
      message = texts.parseError;
      log.error(error.message);
    } else if (error instanceof BackupsUnavailableError) {
      message = texts.backupsUnavailable;
      log.error(`/${interaction.commandName}: ${error.message}`);
    } else if (error instanceof WorldDataUnavailableError) {
      message = texts.worldUnavailable;
      const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
      log.error(`/${interaction.commandName}: ${error.message}${cause}`);
    } else {
      log.error(`/${interaction.commandName} falló`, error);
    }
    await replyError(interaction, message);
  }
}

/** Botones y formularios: si algo falla, se dice (solo a quien lo usó) y queda en el log. */
async function handleComponent(interaction: ButtonInteraction | ModalSubmitInteraction, run: () => Promise<void>): Promise<void> {
  if (interaction.guildId === null) return;
  try {
    await run();
  } catch (error) {
    log.error(`Interacción ${interaction.customId} falló`, error);
    const content = texts.ravensSilent;
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content }).catch(() => undefined);
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
  }
}

async function handleAutocomplete(interaction: AutocompleteInteraction, ctx: CommandContext): Promise<void> {
  const command = commandsByName.get(interaction.commandName);
  if (!command?.autocomplete || interaction.guildId !== ctx.config.DISCORD_GUILD_ID) return;
  try {
    await command.autocomplete(interaction, ctx);
  } catch (error) {
    log.warn(`Autocompletado de /${interaction.commandName}: ${error instanceof Error ? error.message : String(error)}`);
    await interaction.respond([]).catch(() => undefined);
  }
}

async function replyError(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  try {
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content, embeds: [] });
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch {
    // La interacción ha caducado; no hay nada más que hacer.
  }
}

main();
