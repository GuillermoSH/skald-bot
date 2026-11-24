import { SlashCommandBuilder } from "discord.js";
import { duel, type Side } from "../core/duel.js";
import { METRICS } from "../core/metrics.js";
import { baseEmbed } from "../util/embeds.js";
import { isValidPlayerName, safeText } from "../util/escape.js";
import { formatMetric } from "../util/format.js";
import { texts } from "../util/texts.js";
import { autocompletePlayers, findPlayer } from "./players.js";
import type { Command } from "./types.js";

const t = texts.duelo;

export const duelo: Command = {
  data: new SlashCommandBuilder()
    .setName("duelo")
    .setDescription("Enfrenta a dos guerreros, gesta a gesta, a ver quién se lleva la gloria")
    .addStringOption((o) =>
      o.setName(t.optionA).setDescription(t.optionADescription).setRequired(true).setAutocomplete(true),
    )
    .addStringOption((o) =>
      o.setName(t.optionB).setDescription(t.optionBDescription).setRequired(true).setAutocomplete(true),
    ),

  autocomplete: autocompletePlayers,

  async execute(interaction, ctx) {
    const requested = [t.optionA, t.optionB].map((o) => interaction.options.getString(o, true).trim());
    for (const name of requested) {
      if (!isValidPlayerName(name)) {
        await interaction.editReply({ content: texts.cronica.invalidName });
        return;
      }
    }
    const [nameA = "", nameB = ""] = requested;
    if (nameA.toLowerCase() === nameB.toLowerCase()) {
      await interaction.editReply({ content: t.sameWarrior });
      return;
    }

    const [a, b] = await Promise.all([findPlayer(nameA, ctx), findPlayer(nameB, ctx)]);
    for (const [found, name] of [[a, nameA], [b, nameB]] as const) {
      if (!found) {
        await interaction.editReply({ content: texts.cronica.unknown(safeText(name, 32)) });
        return;
      }
    }
    if (!a || !b) return;

    const result = duel(a.player, b.player);
    const shown: Record<Side, string> = { a: safeText(a.name, 32), b: safeText(b.name, 32) };

    const rounds = result.rounds.map((round) => {
      const category = texts.gestas.categories[round.id];
      const value = (side: Side) => {
        const text = formatMetric(METRICS[round.id].unit, round[side]);
        return round.winner === side ? `**${text}**` : text;
      };
      return `${category.emoji} ${category.label} · ${value("a")} ${round.winner ? "🆚" : "⚖️"} ${value("b")}`;
    });

    const verdict = result.winner
      ? [
          t.winner(shown[result.winner], result.score[result.winner], result.score[result.winner === "a" ? "b" : "a"]),
          t.verdicts[Math.floor(Math.random() * t.verdicts.length)] ?? "",
        ]
      : [t.tie(result.score.a), t.tieVerdict];

    const description = [
      t.versus(shown.a, shown.b),
      "",
      ...rounds,
      t.lowerWinsNote,
      "",
      ...verdict,
      t.note,
    ].join("\n");

    const embed = baseEmbed().setTitle(t.title).setDescription(description);
    const champion = result.winner === "b" ? b : a;
    if (result.winner) embed.setThumbnail(`https://mc-heads.net/avatar/${champion.player.uuid}/64`);
    await interaction.editReply({ embeds: [embed] });
  },
};
