/**
 * Registra los comandos slash en el servidor de Discord (DISCORD_GUILD_ID).
 * Se ejecuta a mano (`pnpm register`) cuando se añade o cambia un comando,
 * no en cada arranque del bot.
 */
import { REST, Routes, type APIApplication } from "discord.js";
import { commands } from "./commands/index.js";
import { ConfigError, loadDiscordConfig } from "./config.js";
import { log } from "./util/log.js";

async function register(): Promise<void> {
  const config = loadDiscordConfig();
  const rest = new REST().setToken(config.DISCORD_TOKEN);

  const app = (await rest.get(Routes.currentApplication())) as APIApplication;
  const body = commands.map((c) => c.data.toJSON());
  await rest.put(Routes.applicationGuildCommands(app.id, config.DISCORD_GUILD_ID), { body });

  log.info(`Registrados ${body.length} comandos: ${body.map((c) => `/${c.name}`).join(", ")}`);
}

register().catch((error: unknown) => {
  log.error(error instanceof ConfigError ? error.message : `Error registrando comandos: ${String(error)}`);
  process.exit(1);
});
