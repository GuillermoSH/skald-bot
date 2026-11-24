import path from "node:path";
import {
  Client,
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
import type { CommandContext } from "./commands/types.js";
import { ConfigError, loadConfig } from "./config.js";
import { BackupsUnavailableError } from "./core/backups.js";
import { Chronicle } from "./core/chronicle.js";
import { emptyFirsts, FirstsLedger, firstsSchema } from "./core/firsts.js";
import { jarEnglishLoader, fetchSpanishLang, Translator } from "./core/lang.js";
import { LogWatcher } from "./core/logwatch.js";
import { NameResolver } from "./core/names.js";
import { RconParseError } from "./core/parsers.js";
import { RconClient, RconUnavailableError } from "./core/rcon.js";
import { JsonStore } from "./core/state.js";
import { Herald, heraldNeedsMembers } from "./herald.js";
import { publishRules } from "./rules.js";
import { fetchSendableChannel } from "./util/channels.js";
import { baseEmbed, COLORS } from "./util/embeds.js";
import { getServerStatus } from "./core/status.js";
import { WorldDataUnavailableError, WorldStats } from "./core/stats.js";
import { STARTING_PRESENCE, startPresenceLoop } from "./presence.js";
import { log, setLogLevel } from "./util/log.js";
import { texts } from "./util/texts.js";

const FIRSTS_RECONCILE_MS = 15 * 60_000;

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

  const ctx: CommandContext = {
    config,
    rcon: new RconClient({
      host: config.RCON_HOST,
      port: config.RCON_PORT,
      password: config.RCON_PASSWORD,
      timeoutMs: config.RCON_TIMEOUT_MS,
    }),
    world: new WorldStats(config.DATA_DIR),
    names: new NameResolver(config.DATA_DIR),
    lang: new Translator(
      async () => {
        const status = await getServerStatus(config.MC_HOST, config.MC_PORT, config.RCON_TIMEOUT_MS);
        return status.online ? status.version : null;
      },
      fetchSpanishLang,
      jarEnglishLoader(config.DATA_DIR),
    ),
    chronicle: new Chronicle(),
  };

  let alerts: AlertQueue | null = null;
  let firsts: FirstsLedger | null = null;
  const watcher = new LogWatcher(config.DATA_DIR, ctx.lang, (event, live) => {
    if (live && event.type === "advancement" && event.key && firsts?.claim(event.key, event.player, event.at)) {
      event = { ...event, first: true };
      log.info(`Primero del reino: ${event.player} → ${event.key}`);
    }
    ctx.chronicle.add(event);
    if (live) alerts?.push(event);
  });

  // Histórico de «primeros» desde los ficheros del mundo (en silencio).
  const reconcileFirsts = async () => {
    if (!firsts) return;
    try {
      const added = await firsts.reconcile(await ctx.world.players());
      if (added > 0) log.info(`Primeros del reino: ${added} logros apuntados del histórico (${firsts.size} en total)`);
    } catch (error) {
      log.warn(`No se pudieron revisar los primeros del reino: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  let firstsTimer: NodeJS.Timeout | null = null;

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
      if (needsMembers) await new Herald(config).attach(ready);
      if (config.RULES_CHANNEL_ID) {
        const status = await getServerStatus(config.MC_HOST, config.MC_PORT, config.RCON_TIMEOUT_MS);
        await publishRules(ready, config.RULES_CHANNEL_ID, {
          version: status.online ? status.version : null,
          address: config.MC_PUBLIC_ADDRESS ?? null,
          jarlId: config.ADMIN_USER_IDS[0] ?? null,
        });
      }
    } catch (error) {
      log.error(`Heraldo: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Textos primero (para reconocer muertes y traducir), luego el histórico de primeros, avisos y log.
  const startLogWatch = async (ready: Client<true>) => {
    await ctx.lang.ready();
    try {
      firsts = await FirstsLedger.open(new JsonStore(path.join(config.STATE_DIR, "firsts.json"), firstsSchema, emptyFirsts));
    } catch (error) {
      log.warn(`Sin estado de primeros del reino: ${error instanceof Error ? error.message : String(error)}`);
    }
    await reconcileFirsts();
    // Por si algo se escapa del log (o del bot apagado); en vivo manda el log.
    firstsTimer = setInterval(() => void reconcileFirsts(), FIRSTS_RECONCILE_MS);
    const routes = await buildAlertRoutes(ready, config);
    if (routes.size > 0) {
      alerts = new AlertQueue(routes, {}, (error) => {
        log.warn(`No se pudo enviar un aviso: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
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
  });

  const shutdown = (signal: string) => {
    log.info(`Recibido ${signal}, cerrando…`);
    stopPresence();
    watcher.stop();
    backupWatcher?.stop();
    if (firstsTimer) clearInterval(firstsTimer);
    alerts?.dispose();
    void Promise.allSettled([firsts?.flush(), client.destroy()]).finally(() => process.exit(0));
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
