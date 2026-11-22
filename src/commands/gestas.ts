import { SlashCommandBuilder } from "discord.js";
import { METRIC_IDS, METRICS, rank, type MetricId } from "../core/metrics.js";
import { baseEmbed } from "../util/embeds.js";
import { safeText } from "../util/escape.js";
import { formatMetric } from "../util/format.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

const t = texts.gestas;

function isMetricId(value: string): value is MetricId {
  return (METRIC_IDS as readonly string[]).includes(value);
}

export const gestas: Command = {
  data: new SlashCommandBuilder()
    .setName("gestas")
    .setDescription("Las grandes (y pequeñas) gestas del reino: rankings de los guerreros")
    .addStringOption((o) =>
      o
        .setName(t.optionName)
        .setDescription(t.optionDescription)
        .setRequired(true)
        .addChoices(METRIC_IDS.map((id) => ({ name: `${t.categories[id].emoji} ${t.categories[id].label}`, value: id }))),
    ),

  async execute(interaction, { world, names }) {
    const metricId = interaction.options.getString(t.optionName, true);
    // Discord solo deja elegir entre las opciones, pero se valida igualmente.
    if (!isMetricId(metricId)) throw new Error(`Categoría desconocida: ${metricId}`);

    const category = t.categories[metricId];
    const entries = rank(await world.players(), metricId);
    const resolved = await names.resolve(entries.map((e) => e.uuid));

    const lines = entries.map((e, i) => {
      const name = safeText(resolved.get(e.uuid) ?? texts.unknownWarrior(e.uuid), 32);
      return `${t.medals[i] ?? `${i + 1}.`} **${name}** · ${formatMetric(METRICS[metricId].unit, e.value)}`;
    });

    const description = [
      "hint" in category ? `*${category.hint}*\n` : null,
      lines.length > 0 ? lines.join("\n") : t.empty,
      `\n${t.note}`,
    ]
      .filter((l) => l !== null)
      .join("\n");

    await interaction.editReply({
      embeds: [baseEmbed().setTitle(`${category.emoji} ${category.label}`).setDescription(description)],
    });
  },
};
