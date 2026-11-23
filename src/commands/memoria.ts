import { SlashCommandBuilder, time, TimestampStyles } from "discord.js";
import { assessBackups, listBackups } from "../core/backups.js";
import { baseEmbed, COLORS } from "../util/embeds.js";
import { safeText } from "../util/escape.js";
import { formatBytes } from "../util/format.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

const t = texts.memoria;

export const memoria: Command = {
  data: new SlashCommandBuilder()
    .setName("memoria")
    .setDescription("La memoria del reino: estado de las copias de seguridad"),

  async execute(interaction, { config }) {
    const files = await listBackups(config.BACKUPS_DIR);
    const health = assessBackups(files, new Date(), config.BACKUP_MAX_AGE_HOURS * 3_600_000);
    const embed = baseEmbed(health.status === "ok" ? COLORS.ok : COLORS.error)
      .setTitle(t.title)
      .setDescription(t.intro)
      .addFields({ name: t.fields.status, value: t.status[health.status] });

    const { latest } = health;
    if (!latest) {
      embed.addFields({ name: t.fields.latest, value: t.none });
    } else {
      embed.addFields(
        {
          name: t.fields.latest,
          value: `${time(latest.mtime, TimestampStyles.FullDateShortTime)}\n${time(latest.mtime, TimestampStyles.RelativeTime)}`,
          inline: true,
        },
        { name: t.fields.size, value: formatBytes(latest.size), inline: true },
        { name: t.fields.count, value: t.count(health.count, formatBytes(health.totalSize)), inline: true },
        {
          name: t.fields.history,
          value: files
            .slice(0, 7)
            .map((f) => `• ${time(f.mtime, TimestampStyles.ShortDate)} · ${formatBytes(f.size)} · \`${safeText(f.name, 60)}\``)
            .join("\n"),
        },
      );
    }
    await interaction.editReply({ embeds: [embed] });
  },
};
