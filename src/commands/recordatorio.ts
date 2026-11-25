import { SlashCommandBuilder, time, TimestampStyles } from "discord.js";
import { MAX_PENDING_PER_USER } from "../core/reminders.js";
import { parseWhen } from "../core/when.js";
import { baseEmbed } from "../util/embeds.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

const t = texts.recordatorio;
const YEAR_MS = 366 * 86_400_000;

export const recordatorio: Command = {
  data: new SlashCommandBuilder()
    .setName("recordatorio")
    .setDescription("Skald te lo recuerda: por privado o en el canal")
    .addSubcommand((s) =>
      s
        .setName("nuevo")
        .setDescription(t.nuevoDescription)
        .addStringOption((o) => o.setName(t.when).setDescription(t.whenDescription).setRequired(true).setMaxLength(40))
        .addStringOption((o) => o.setName(t.text).setDescription(t.textDescription).setRequired(true).setMaxLength(500))
        .addBooleanOption((o) => o.setName(t.channel).setDescription(t.channelDescription)),
    )
    .addSubcommand((s) => s.setName("lista").setDescription(t.listaDescription))
    .addSubcommand((s) =>
      s
        .setName("borrar")
        .setDescription(t.borrarDescription)
        .addIntegerOption((o) => o.setName(t.id).setDescription(t.idDescription).setRequired(true).setMinValue(1)),
    ),
  ephemeral: true,

  async execute(interaction, ctx) {
    const reminders = ctx.realm.reminders;
    if (!reminders || !interaction.guildId) {
      await interaction.editReply({ content: t.unavailable });
      return;
    }
    const userId = interaction.user.id;

    switch (interaction.options.getSubcommand()) {
      case "lista": {
        const pending = reminders.pendingFor(userId);
        const lines = pending.map((r) =>
          t.listLine(r.id, time(r.dueAt, TimestampStyles.FullDateShortTime), r.text.slice(0, 200), r.kind === "channel"),
        );
        await interaction.editReply({
          embeds: [baseEmbed().setTitle(t.listTitle).setDescription(lines.length > 0 ? lines.join("\n\n") : t.listEmpty)],
        });
        return;
      }

      case "borrar": {
        const id = interaction.options.getInteger(t.id, true);
        await interaction.editReply({ content: reminders.cancel(id, userId) ? t.deleted(id) : t.notFound });
        return;
      }

      default: {
        const now = new Date();
        const due = parseWhen(interaction.options.getString(t.when, true), now, ctx.config.TIMEZONE);
        if (!due) {
          await interaction.editReply({ content: t.badDate });
          return;
        }
        if (due.getTime() < now.getTime() + 60_000) {
          await interaction.editReply({ content: t.tooSoon });
          return;
        }
        if (due.getTime() - now.getTime() > YEAR_MS) {
          await interaction.editReply({ content: t.tooFar });
          return;
        }
        if (reminders.pendingFor(userId).length >= MAX_PENDING_PER_USER) {
          await interaction.editReply({ content: t.tooMany(MAX_PENDING_PER_USER) });
          return;
        }
        const inChannel = interaction.options.getBoolean(t.channel) ?? false;
        reminders.add({
          kind: inChannel ? "channel" : "user",
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          userId,
          text: interaction.options.getString(t.text, true).trim(),
          dueAt: due,
          eventId: null,
        });
        await interaction.editReply({
          content: t.saved(time(due, TimestampStyles.FullDateShortTime), time(due, TimestampStyles.RelativeTime), inChannel ? t.inChannel : t.byDm),
        });
      }
    }
  },
};
