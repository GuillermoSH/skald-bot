import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from "discord.js";
import { baseEmbed } from "../util/embeds.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

export const mapa: Command = {
  data: new SlashCommandBuilder().setName("mapa").setDescription("El mapa del reino en BlueMap"),

  async execute(interaction, { config }) {
    const url = config.BLUEMAP_URL;
    if (!url) {
      await interaction.editReply({ content: texts.mapMissing });
      return;
    }

    const button = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(texts.mapButton).setURL(url);
    await interaction.editReply({
      embeds: [baseEmbed().setTitle(texts.mapTitle).setDescription(`${texts.mapBody}\n${url}`)],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
    });
  },
};
