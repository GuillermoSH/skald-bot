import { SlashCommandBuilder, time, TimestampStyles } from "discord.js";
import { METRICS } from "../core/metrics.js";
import { stat, topStat } from "../core/stats.js";
import { baseEmbed } from "../util/embeds.js";
import { isValidPlayerName, safeText } from "../util/escape.js";
import { formatCount, formatDistance, formatDuration } from "../util/format.js";
import { texts } from "../util/texts.js";
import { autocompletePlayers, findPlayer } from "./players.js";
import type { Command } from "./types.js";

const t = texts.cronica;

export const cronica: Command = {
  data: new SlashCommandBuilder()
    .setName("cronica")
    .setDescription("La crónica de un guerrero: sus horas, sus muertes y sus hazañas")
    .addStringOption((o) =>
      o.setName(t.optionName).setDescription(t.optionDescription).setRequired(true).setAutocomplete(true),
    ),

  autocomplete: autocompletePlayers,

  async execute(interaction, ctx) {
    const requested = interaction.options.getString(t.optionName, true).trim();
    if (!isValidPlayerName(requested)) {
      await interaction.editReply({ content: t.invalidName });
      return;
    }

    const found = await findPlayer(requested, ctx);
    if (!found) {
      await interaction.editReply({ content: t.unknown(safeText(requested, 32)) });
      return;
    }

    const { player, name } = found;
    await ctx.lang.ready();
    const { lang } = ctx;

    const killer = topStat(player, "killed_by");
    const prey = topStat(player, "killed");
    const block = topStat(player, "mined");
    const deaths = stat(player, "custom", "deaths");
    const firsts = ctx.realm.firstsOf(player.uuid, name);

    const latest = player.advancements.slice(0, 3).map((a) => {
      const when = a.doneAt ? ` · ${time(a.doneAt, TimestampStyles.RelativeTime)}` : "";
      return `• ${safeText(lang.advancement(a.id), 80)}${when}`;
    });

    const embed = baseEmbed()
      .setTitle(t.title(safeText(name, 32)))
      .setThumbnail(`https://mc-heads.net/avatar/${player.uuid}/64`)
      .addFields(
        { name: t.playTime, value: formatDuration(METRICS.play_time.value(player)), inline: true },
        {
          name: t.deaths,
          value: [formatCount(deaths), killer ? t.killer(lang.entity(killer.key), formatCount(killer.value)) : null]
            .filter(Boolean)
            .join("\n"),
          inline: true,
        },
        { name: t.sinceDeath, value: formatDuration(METRICS.survivor.value(player)), inline: true },
        {
          name: t.mobKills,
          value: [
            formatCount(METRICS.mob_kills.value(player)),
            prey ? t.prey(lang.entity(prey.key), formatCount(prey.value)) : null,
          ]
            .filter(Boolean)
            .join("\n"),
          inline: true,
        },
        {
          name: t.mined,
          value: [
            formatCount(METRICS.blocks_mined.value(player)),
            block ? t.favouriteBlock(lang.blockOrItem(block.key)) : null,
          ]
            .filter(Boolean)
            .join("\n"),
          inline: true,
        },
        { name: t.distance, value: formatDistance(METRICS.distance.value(player)), inline: true },
        {
          name: t.advancements(player.advancements.length),
          value: [firsts > 0 ? t.firsts(firsts) : null, latest.length > 0 ? latest.join("\n") : t.noAdvancements]
            .filter((l) => l !== null)
            .join("\n"),
        },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};
