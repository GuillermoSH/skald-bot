import {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  TimestampStyles,
} from "discord.js";
import { parseWhen } from "../core/when.js";
import { asset, assetPath } from "../util/assets.js";
import { baseEmbed } from "../util/embeds.js";
import { log } from "../util/log.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

const t = texts.quedada;
const YEAR_MS = 366 * 86_400_000;
/** Aviso previo a los interesados. */
export const QUEDADA_NOTICE_MS = 30 * 60_000;

export const quedada: Command = {
  data: new SlashCommandBuilder()
    .setName("quedada")
    .setDescription("Convoca al reino: crea un evento y Skald avisa a los interesados antes de empezar")
    .addStringOption((o) => o.setName(t.title).setDescription(t.titleDescription).setRequired(true).setMaxLength(90))
    .addStringOption((o) => o.setName(t.date).setDescription(t.dateDescription).setRequired(true).setMaxLength(40))
    .addNumberOption((o) => o.setName(t.hours).setDescription(t.hoursDescription).setMinValue(0.5).setMaxValue(24))
    .addStringOption((o) => o.setName(t.details).setDescription(t.detailsDescription).setMaxLength(800)),
  ephemeral: true,

  async execute(interaction, ctx) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    const perms = interaction.appPermissions;
    if (!guild || !perms.any([PermissionFlagsBits.CreateEvents, PermissionFlagsBits.ManageEvents])) {
      await interaction.editReply({ content: t.noPermission });
      return;
    }

    const now = new Date();
    const start = parseWhen(interaction.options.getString(t.date, true), now, ctx.config.TIMEZONE);
    if (!start) {
      await interaction.editReply({ content: t.badDate });
      return;
    }
    if (start.getTime() <= now.getTime() + 60_000) {
      await interaction.editReply({ content: t.past });
      return;
    }
    if (start.getTime() - now.getTime() > YEAR_MS) {
      await interaction.editReply({ content: t.tooFar });
      return;
    }
    const hours = interaction.options.getNumber(t.hours) ?? 2;
    const end = new Date(start.getTime() + hours * 3_600_000);
    const title = interaction.options.getString(t.title, true).trim();
    const details = interaction.options.getString(t.details)?.trim() || undefined;

    const cover = assetPath("quedada.png");
    const event = await guild.scheduledEvents.create({
      name: title,
      scheduledStartTime: start,
      scheduledEndTime: end,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.External,
      entityMetadata: { location: t.location(ctx.realm.season?.name ?? null) },
      ...(details ? { description: details } : {}),
      ...(cover ? { image: cover } : {}),
      reason: `Quedada de ${interaction.user.id}`,
    });

    // Anuncio en el canal: el enlace del evento (Discord lo enseña como tarjeta con «Interesado»).
    if (channel?.isSendable()) {
      const image = asset("quedada.gif");
      const embed = baseEmbed()
        .setTitle(t.announceTitle(title))
        .setDescription(
          [
            t.announceBody(time(start, TimestampStyles.FullDateShortTime), time(start, TimestampStyles.RelativeTime), String(hours), `<@${interaction.user.id}>`),
            details ? `\n${details}` : null,
            `\n${t.announceFooter}`,
          ]
            .filter((l) => l !== null)
            .join("\n"),
        );
      if (image) embed.setImage(image.url);
      await channel
        .send({ content: event.url, embeds: [embed], files: image ? [image.file] : [], allowedMentions: { parse: [] } })
        .catch((error: unknown) => {
          log.warn(`No se pudo anunciar la quedada: ${error instanceof Error ? error.message : String(error)}`);
        });
    }

    // Aviso previo a los interesados (si da tiempo).
    const reminders = ctx.realm.reminders;
    if (reminders && start.getTime() - now.getTime() > QUEDADA_NOTICE_MS + 60_000) {
      reminders.add({
        kind: "event",
        guildId: guild.id,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        text: title,
        dueAt: new Date(start.getTime() - QUEDADA_NOTICE_MS),
        eventId: event.id,
      });
    }
    await interaction.editReply({ content: t.done(event.url) });
  },
};
