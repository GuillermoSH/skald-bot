import { SlashCommandBuilder } from "discord.js";
import { rankCauses } from "../core/deaths.js";
import { baseEmbed } from "../util/embeds.js";
import { isValidPlayerName, safeText } from "../util/escape.js";
import { formatCount } from "../util/format.js";
import { texts } from "../util/texts.js";
import { autocompletePlayers } from "./players.js";
import type { Command } from "./types.js";

const t = texts.hel;
const MEDALS = ["🥇", "🥈", "🥉"];
const LIMIT = 10;

export const hel: Command = {
  data: new SlashCommandBuilder()
    .setName("hel")
    .setDescription("Qué mata más en el reino: las causas de muerte de todos los tiempos")
    .addStringOption((o) => o.setName(t.optionName).setDescription(t.optionDescription).setAutocomplete(true)),

  autocomplete: autocompletePlayers,

  async execute(interaction, { deaths, lang }) {
    const requested = interaction.options.getString(t.optionName)?.trim() || null;
    if (requested && !isValidPlayerName(requested)) {
      await interaction.editReply({ content: texts.cronica.invalidName });
      return;
    }

    const all = await deaths.all();
    const own = requested ? all.filter((d) => d.player.toLowerCase() === requested.toLowerCase()) : all;
    // El nombre tal cual sale en el log (con sus mayúsculas), si lo hay.
    const shown = requested ? safeText(own[0]?.player ?? requested, 32) : null;
    const embed = baseEmbed().setTitle(shown ? t.titleFor(shown) : t.title);

    if (own.length === 0) {
      await interaction.editReply({ embeds: [embed.setDescription(shown ? t.emptyFor(shown) : t.empty)] });
      return;
    }

    const causes = rankCauses(own).slice(0, LIMIT);
    const lines = causes.map((c, i) => {
      const label = c.killer ? lang.fromEnglishName(c.killer) : ((c.key && lang.deathCause(c.key)) ?? t.unknownCause);
      const emoji = c.killer ? t.combatEmoji : t.helEmoji;
      const share = Math.round((c.count / own.length) * 100);
      return `${MEDALS[i] ?? `${i + 1}.`} ${emoji} **${safeText(label, 80)}** · ${formatCount(c.count)} (${share} %)`;
    });
    const combat = own.filter((d) => d.combat).length;

    const description = [
      shown ? t.leadFor(shown) : t.lead,
      "",
      ...lines,
      "",
      t.split(formatCount(combat), formatCount(own.length - combat)),
      shown ? t.totalFor(shown, formatCount(own.length)) : t.total(formatCount(own.length)),
    ].join("\n");
    await interaction.editReply({ embeds: [embed.setDescription(description)] });
  },
};
