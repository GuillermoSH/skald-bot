import { SlashCommandBuilder } from "discord.js";
import { EARN_CATEGORIES, EARN_RULES } from "../core/economy.js";
import { baseEmbed } from "../util/embeds.js";
import { isValidPlayerName, safeText } from "../util/escape.js";
import { formatCount } from "../util/format.js";
import { texts } from "../util/texts.js";
import { autocompletePlayers, findPlayer } from "./players.js";
import type { Command } from "./types.js";

const t = texts.tesoro;

export const tesoro: Command = {
  data: new SlashCommandBuilder()
    .setName("tesoro")
    .setDescription("Las monedas de plata del reino: quién tiene el cofre más lleno")
    .addStringOption((o) => o.setName(t.optionName).setDescription(t.optionDescription).setAutocomplete(true)),

  autocomplete: autocompletePlayers,

  async execute(interaction, ctx) {
    const economy = ctx.realm.economy;
    if (!economy) {
      await interaction.editReply({ content: t.disabled });
      return;
    }

    const requested = interaction.options.getString(t.optionName)?.trim() || null;
    if (requested) {
      if (!isValidPlayerName(requested)) {
        await interaction.editReply({ content: texts.cronica.invalidName });
        return;
      }
      const found = await findPlayer(requested, ctx);
      if (!found) {
        await interaction.editReply({ content: texts.cronica.unknown(safeText(requested, 32)) });
        return;
      }
      const today = economy.earnedToday(found.player.uuid);
      const lines = [
        t.coins(formatCount(economy.balance(found.player.uuid))),
        "",
        t.todayHeading,
        ...EARN_CATEGORIES.map((c) => t.today(t.categories[c], formatCount(today[c]), formatCount(EARN_RULES[c].dailyCap))),
        "",
        t.note,
      ];
      const embed = baseEmbed()
        .setTitle(t.titleFor(safeText(found.name, 32)))
        .setThumbnail(`https://mc-heads.net/avatar/${found.player.uuid}/64`)
        .setDescription(lines.join("\n"));
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const top = economy.top(10);
    const resolved = await ctx.names.resolve(top.map((e) => e.uuid));
    const lines = top.map((e, i) =>
      t.line(texts.gestas.medals[i] ?? `${i + 1}.`, safeText(resolved.get(e.uuid) ?? texts.unknownWarrior(e.uuid), 32), formatCount(e.balance)),
    );
    const description = lines.length > 0 ? [...lines, "", t.note].join("\n") : t.empty;
    await interaction.editReply({ embeds: [baseEmbed().setTitle(t.title).setDescription(description)] });
  },
};
