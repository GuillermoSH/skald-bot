import { SlashCommandBuilder } from "discord.js";
import { baseEmbed } from "../util/embeds.js";
import { isValidPlayerName, safeText } from "../util/escape.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

export const guerreros: Command = {
  data: new SlashCommandBuilder().setName("guerreros").setDescription("Quién está conectado ahora mismo"),

  async execute(interaction, { rcon }) {
    const list = await rcon.listPlayers();
    const names = list.names
      // Un nombre de Java válido no necesita escape, pero por si acaso (mods, Bedrock vía Geyser...).
      .map((name) => `• ${safeText(name, 32)}${isValidPlayerName(name) ? "" : " ❓"}`)
      .join("\n");

    const embed = baseEmbed()
      .setTitle(texts.warriorsTitle(list.online, list.max))
      .setDescription(names || texts.warriorsEmpty);
    await interaction.editReply({ embeds: [embed] });
  },
};
