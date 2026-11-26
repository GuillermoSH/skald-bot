import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { MojangClient, MojangUnavailableError } from "../core/mojang.js";
import { isValidPlayerName, safeText } from "../util/escape.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

const t = texts.link;
const mojang = new MojangClient();

export const vincular: Command = {
  data: new SlashCommandBuilder()
    .setName("vincular")
    .setDescription(t.vincularDescription)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName(t.userOption).setDescription(t.userOptionDescription).setRequired(true))
    .addStringOption((o) => o.setName(t.nameOption).setDescription(t.nameOptionDescription).setRequired(true).setMaxLength(16)),
  ephemeral: true,

  async execute(interaction, ctx) {
    if (!ctx.config.ADMIN_USER_IDS.includes(interaction.user.id)) {
      await interaction.editReply({ content: t.onlyJarl });
      return;
    }
    const linking = ctx.linking;
    const guild = interaction.guild;
    if (!linking || !guild) {
      await interaction.editReply({ content: t.disabled });
      return;
    }
    const target = interaction.options.getUser(t.userOption, true);
    const name = interaction.options.getString(t.nameOption, true).trim();
    if (target.bot || !isValidPlayerName(name)) {
      await interaction.editReply({ content: t.invalidName });
      return;
    }
    let profile;
    try {
      profile = await mojang.lookup(name);
    } catch (error) {
      if (!(error instanceof MojangUnavailableError)) throw error;
      await interaction.editReply({ content: t.mojangDown });
      return;
    }
    if (!profile) {
      await interaction.editReply({ content: t.notFound(safeText(name, 16)) });
      return;
    }
    const user = `<@${target.id}>`;
    const result = await linking.link(guild, target.id, profile.uuid.replaceAll("-", ""), profile.name, interaction.user.id);
    const content =
      result.kind === "discord_taken"
        ? t.adminTaken(user, safeText(result.link.mcName, 16))
        : result.kind === "uuid_taken"
          ? t.adminUuidTaken(`<@${result.link.discordId}>`)
          : t.adminDone(user, safeText(profile.name, 16), result.link.status === "active" ? t.statusActive : t.statusPending);
    await interaction.editReply({ content, allowedMentions: { parse: [] } });
  },
};

export const desvincular: Command = {
  data: new SlashCommandBuilder()
    .setName("desvincular")
    .setDescription(t.desvincularDescription)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName(t.userOption).setDescription(t.userOptionDescription).setRequired(true)),
  ephemeral: true,

  async execute(interaction, ctx) {
    if (!ctx.config.ADMIN_USER_IDS.includes(interaction.user.id)) {
      await interaction.editReply({ content: t.onlyJarl });
      return;
    }
    if (!ctx.linking) {
      await interaction.editReply({ content: t.disabled });
      return;
    }
    const target = interaction.options.getUser(t.userOption, true);
    const user = `<@${target.id}>`;
    const removed = await ctx.linking.unlink(target.id, interaction.user.id);
    await interaction.editReply({
      content: removed ? t.unlinked(user, safeText(removed.mcName, 16)) : t.notLinked(user),
      allowedMentions: { parse: [] },
    });
  },
};
