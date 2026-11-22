import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { commandsByName } from "./commands/index.js";
import type { CommandContext } from "./commands/types.js";
import { ConfigError, loadConfig } from "./config.js";
import { Translator } from "./core/lang.js";
import { NameResolver } from "./core/names.js";
import { RconParseError } from "./core/parsers.js";
import { RconClient, RconUnavailableError } from "./core/rcon.js";
import { getServerStatus } from "./core/status.js";
import { WorldDataUnavailableError, WorldStats } from "./core/stats.js";
import { STARTING_PRESENCE, startPresenceLoop } from "./presence.js";
import { log, setLogLevel } from "./util/log.js";
import { texts } from "./util/texts.js";

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
    lang: new Translator(async () => {
      const status = await getServerStatus(config.MC_HOST, config.MC_PORT, config.RCON_TIMEOUT_MS);
      return status.online ? status.version : null;
    }),
  };

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    // Nunca mencionar a nadie, venga el texto de donde venga.
    allowedMentions: { parse: [] },
    presence: STARTING_PRESENCE,
  });

  let stopPresence: () => void = () => {};
  client.once(Events.ClientReady, (ready) => {
    log.info(`Conectado a Discord como ${ready.user.tag}`);
    stopPresence = startPresenceLoop(ready, config);
    // Precarga de los textos en español (no bloquea; si falla se reintenta al usarlos).
    void ctx.lang.ready();
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isChatInputCommand()) void handleCommand(interaction, ctx);
    else if (interaction.isAutocomplete()) void handleAutocomplete(interaction, ctx);
  });

  const shutdown = (signal: string) => {
    log.info(`Recibido ${signal}, cerrando…`);
    stopPresence();
    void client.destroy().finally(() => process.exit(0));
  };
  process.once("SIGINT", () => { shutdown("SIGINT"); });
  process.once("SIGTERM", () => { shutdown("SIGTERM"); });

  client.login(config.DISCORD_TOKEN).catch((error: unknown) => {
    // Sin volcar el error entero: no queremos que el token acabe en un log.
    log.error(`No se pudo iniciar sesión en Discord: ${error instanceof Error ? error.message : "error desconocido"}`);
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
