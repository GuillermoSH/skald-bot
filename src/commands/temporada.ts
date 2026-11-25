import { SlashCommandBuilder, time, TimestampStyles } from "discord.js";
import { METRICS } from "../core/metrics.js";
import type { FinalRanking } from "../realm.js";
import { FINAL_RANKING_METRICS } from "../realm.js";
import { baseEmbed } from "../util/embeds.js";
import { safeText } from "../util/escape.js";
import { formatMetric } from "../util/format.js";
import { texts } from "../util/texts.js";
import type { Command, CommandContext } from "./types.js";

const t = texts.temporada;

export const temporada: Command = {
  data: new SlashCommandBuilder()
    .setName("temporada")
    .setDescription("Las eras del reino: cada mundo es una era")
    .addSubcommand((s) => s.setName("actual").setDescription(t.actualDescription))
    .addSubcommand((s) => s.setName("historial").setDescription(t.historialDescription))
    .addSubcommand((s) =>
      s
        .setName("nueva")
        .setDescription(t.nuevaDescription)
        .addStringOption((o) => o.setName(t.nameOption).setDescription(t.nameOptionDescription).setRequired(true).setMaxLength(40)),
    ),

  async execute(interaction, ctx) {
    const { realm } = ctx;
    const seasons = realm.seasons;
    if (!seasons) {
      await interaction.editReply({ content: t.unavailable });
      return;
    }

    switch (interaction.options.getSubcommand()) {
      case "nueva": {
        if (!ctx.config.ADMIN_USER_IDS.includes(interaction.user.id)) {
          await interaction.editReply({ content: t.onlyJarl });
          return;
        }
        const name = safeText(interaction.options.getString(t.nameOption, true).trim(), 40);
        const sameWorld = realm.pendingLevelName === null;
        const { closed, opened } = await realm.openSeason(name);
        const lines = [t.opened(closed ? safeText(closed.name, 40) : null, safeText(opened.name, 40))];
        if (sameWorld && closed) lines.push(t.sameWorld(safeText(opened.levelName, 40)));
        await interaction.editReply({ content: lines.join("\n") });
        return;
      }

      case "historial": {
        const past = seasons.list().filter((s) => s.endedAt !== null);
        if (past.length === 0) {
          await interaction.editReply({ embeds: [baseEmbed().setTitle(t.historyTitle).setDescription(t.noHistory)] });
          return;
        }
        const blocks = await Promise.all(past.slice(0, 10).map((s) => historyBlock(s, ctx)));
        await interaction.editReply({ embeds: [baseEmbed().setTitle(t.historyTitle).setDescription(blocks.join("\n\n"))] });
        return;
      }

      default: {
        const season = realm.season;
        if (!season) {
          await interaction.editReply({ content: t.unavailable });
          return;
        }
        const embed = baseEmbed()
          .setTitle(t.currentTitle(safeText(season.name, 40)))
          .addFields(
            { name: t.world, value: `\`${safeText(season.levelName, 40)}\``, inline: true },
            { name: t.since, value: time(new Date(season.startedAt), TimestampStyles.LongDate), inline: true },
          );
        const pending = realm.pendingLevelName;
        if (pending) embed.setDescription(t.paused(safeText(pending, 40)));
        await interaction.editReply({ embeds: [embed] });
      }
    }
  },
};

async function historyBlock(
  season: { name: string; startedAt: string; endedAt: string | null; finalRanking: string | null },
  { names }: CommandContext,
): Promise<string> {
  const from = time(new Date(season.startedAt), TimestampStyles.ShortDate);
  const to = season.endedAt ? time(new Date(season.endedAt), TimestampStyles.ShortDate) : null;
  const lines = [t.historyLine(safeText(season.name, 40), from, to)];
  const ranking = parseRanking(season.finalRanking);
  const champions = FINAL_RANKING_METRICS.flatMap((m) => {
    const best = ranking[m]?.[0];
    return best ? [{ metric: m, ...best }] : [];
  });
  const resolved = await names.resolve(champions.map((c) => c.uuid));
  for (const c of champions) {
    const category = texts.gestas.categories[c.metric];
    const name = safeText(resolved.get(c.uuid) ?? texts.unknownWarrior(c.uuid), 32);
    lines.push(t.champion(`${category.emoji} ${category.label}`, name, formatMetric(METRICS[c.metric].unit, c.value)));
  }
  return lines.join("\n");
}

function parseRanking(raw: string | null): FinalRanking {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as FinalRanking;
  } catch {
    return {};
  }
}
