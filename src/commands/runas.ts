import { SlashCommandBuilder } from "discord.js";
import { detectAdapter } from "../adapters/index.js";
import { RconParseError } from "../core/parsers.js";
import { RconUnavailableError } from "../core/rcon.js";
import { getServerStatus } from "../core/status.js";
import { baseEmbed, COLORS } from "../util/embeds.js";
import { safeText } from "../util/escape.js";
import { log } from "../util/log.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

export const runas: Command = {
  data: new SlashCommandBuilder()
    .setName("runas")
    .setDescription("Versión, mods y datos técnicos del servidor"),

  async execute(interaction, { config, rcon }) {
    const [status, version] = await Promise.all([
      getServerStatus(config.MC_HOST, config.MC_PORT, config.RCON_TIMEOUT_MS),
      rcon.queryVersion().catch((error: unknown) => {
        // Un servidor no vanilla responde otra cosa a `version`: no es un error grave.
        if (!(error instanceof RconUnavailableError || error instanceof RconParseError)) throw error;
        log.warn(`/runas sin datos de RCON: ${error.message}`);
        return null;
      }),
    ]);

    if (!status.online && !version) {
      await interaction.editReply({
        embeds: [baseEmbed(COLORS.error).setTitle(texts.realmOfflineTitle).setDescription(texts.realmOfflineBody)],
      });
      return;
    }

    const f = texts.runesFields;
    const versionName = version?.name ?? (status.online ? status.version : "?");
    const adapter = detectAdapter({ versionName: status.online ? status.version : versionName });
    const embed = baseEmbed()
      .setTitle(texts.runesTitle)
      .addFields(
        { name: f.version, value: safeText(versionName, 64), inline: true },
        { name: f.loader, value: adapter.displayName, inline: true },
      );

    const protocol = version?.protocol ?? (status.online ? status.protocol : null);
    if (protocol !== null) embed.addFields({ name: f.protocol, value: String(protocol), inline: true });

    if (version) {
      if (version.dataVersion !== null) {
        embed.addFields({ name: f.dataVersion, value: String(version.dataVersion), inline: true });
      }
      if (version.resourcePack && version.dataPack) {
        embed.addFields({
          name: f.packs,
          value: `${safeText(version.resourcePack, 16)} / ${safeText(version.dataPack, 16)}`,
          inline: true,
        });
      }
      if (version.buildTime) embed.addFields({ name: f.build, value: safeText(version.buildTime, 64) });
    } else {
      embed.setDescription(texts.runesNoRcon);
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
