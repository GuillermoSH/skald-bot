import { PermissionFlagsBits, SlashCommandBuilder, type SlashCommandStringOption } from "discord.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

const t = texts.encuesta;
const MAX_OPTIONS = 8;

const builder = new SlashCommandBuilder()
  .setName("encuesta")
  .setDescription("Pregunta al reino con una encuesta (Discord publica el resultado al cerrar)")
  .addStringOption((o) => o.setName(t.question).setDescription(t.questionDescription).setRequired(true).setMaxLength(300));
for (let n = 1; n <= MAX_OPTIONS; n++) {
  builder.addStringOption((o: SlashCommandStringOption) =>
    o.setName(t.option(n)).setDescription(t.optionDescription(n)).setRequired(n <= 2).setMaxLength(55),
  );
}
builder
  .addIntegerOption((o) => o.setName(t.hours).setDescription(t.hoursDescription).setMinValue(1).setMaxValue(168))
  .addBooleanOption((o) => o.setName(t.multiple).setDescription(t.multipleDescription));

export const encuesta: Command = {
  data: builder,
  // Se contesta solo a quien la crea; la encuesta se publica aparte en el canal.
  ephemeral: true,

  async execute(interaction) {
    const channel = interaction.channel;
    const perms = interaction.appPermissions;
    if (!channel?.isSendable() || !perms.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendPolls])) {
      await interaction.editReply({ content: t.noPermission });
      return;
    }
    const answers: string[] = [];
    for (let n = 1; n <= MAX_OPTIONS; n++) {
      const value = interaction.options.getString(t.option(n))?.trim();
      if (value) answers.push(value);
    }
    if (new Set(answers.map((a) => a.toLowerCase())).size !== answers.length) {
      await interaction.editReply({ content: t.duplicated });
      return;
    }
    await channel.send({
      content: t.header(`<@${interaction.user.id}>`),
      poll: {
        question: { text: interaction.options.getString(t.question, true).trim() },
        answers: answers.map((text) => ({ text })),
        duration: interaction.options.getInteger(t.hours) ?? 24,
        allowMultiselect: interaction.options.getBoolean(t.multiple) ?? false,
      },
      allowedMentions: { parse: [] },
    });
    await interaction.editReply({ content: t.done });
  },
};
