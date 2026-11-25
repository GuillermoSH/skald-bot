import { SlashCommandBuilder } from "discord.js";
import { baseEmbed } from "../util/embeds.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

/** Se construye con la lista de comandos para no tener que mantenerla a mano. */
export function createAyuda(getCommands: () => readonly Command[]): Command {
  return {
    data: new SlashCommandBuilder().setName("ayuda").setDescription("Lo que sabe cantar Skald"),
    ephemeral: true,

    async execute(interaction) {
      // Los de administración (con permisos por defecto) no se anuncian.
      const lines = getCommands()
        .map((c) => c.data.toJSON())
        .filter((json) => json.default_member_permissions == null)
        .map((json) => `**/${json.name}** · ${json.description}`);
      await interaction.editReply({ embeds: [baseEmbed().setTitle(texts.helpTitle).setDescription(lines.join("\n"))] });
    },
  };
}
