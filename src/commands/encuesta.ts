import { PermissionFlagsBits, SlashCommandBuilder, type SendableChannels, type SlashCommandStringOption } from "discord.js";
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
    await publishPoll(channel, {
      header: t.header(`<@${interaction.user.id}>`),
      question: interaction.options.getString(t.question, true).trim(),
      answers,
      hours: interaction.options.getInteger(t.hours) ?? 24,
      multiple: interaction.options.getBoolean(t.multiple) ?? false,
    });
    await interaction.editReply({ content: t.done });
  },
};

export interface PollInput {
  header: string;
  question: string;
  answers: string[];
  hours: number;
  multiple: boolean;
}

/** Publica una encuesta nativa (la usan `/encuesta` y `!encuesta`). Recorta a los límites de Discord. */
export async function publishPoll(channel: SendableChannels, input: PollInput): Promise<void> {
  await channel.send({
    content: input.header,
    poll: {
      question: { text: input.question.slice(0, 300) },
      answers: input.answers.slice(0, MAX_OPTIONS).map((text) => ({ text: text.slice(0, 55) })),
      duration: Math.min(168, Math.max(1, Math.round(input.hours))),
      allowMultiselect: input.multiple,
    },
    allowedMentions: { parse: [] },
  });
}
