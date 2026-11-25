import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { EARN_CATEGORIES, GIFT_CAP } from "../core/economy.js";
import { baseEmbed } from "../util/embeds.js";
import { safeText } from "../util/escape.js";
import { formatCount } from "../util/format.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

const t = texts.regalo;

export const regalo: Command = {
  data: new SlashCommandBuilder()
    .setName("regalo")
    .setDescription("Regalo inicial de monedas por lo ya jugado (solo el Jarl)")
    // Discord lo oculta a quien no es administrador; además se comprueba el ID.
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName("vista").setDescription(t.vistaDescription))
    .addSubcommand((s) => s.setName("aplicar").setDescription(t.aplicarDescription)),
  ephemeral: true,

  async execute(interaction, ctx) {
    if (!ctx.config.ADMIN_USER_IDS.includes(interaction.user.id)) {
      await interaction.editReply({ content: t.onlyJarl });
      return;
    }
    const economy = ctx.realm.economy;
    if (!economy) {
      await interaction.editReply({ content: texts.tesoro.disabled });
      return;
    }

    if (interaction.options.getSubcommand() === "aplicar") {
      if (economy.giftApplied) {
        await interaction.editReply({ content: t.alreadyApplied });
        return;
      }
      const { players, coins } = economy.applyGift();
      await interaction.editReply({ content: t.applied(players, formatCount(coins)) });
      return;
    }

    const gifts = economy.giftPreview().filter((g) => g.total > 0);
    if (gifts.length === 0) {
      await interaction.editReply({ content: t.empty });
      return;
    }
    const names = await ctx.names.resolve(gifts.map((g) => g.uuid));
    const lines = gifts.slice(0, 25).map((g) => {
      const parts = EARN_CATEGORIES.map((c) => `${texts.tesoro.categories[c]} ${formatCount(g.byCategory[c])}`).join(" · ");
      return t.line(safeText(names.get(g.uuid) ?? texts.unknownWarrior(g.uuid), 32), formatCount(g.total), parts, g.capped);
    });
    const coins = gifts.reduce((sum, g) => sum + g.total, 0);
    const description = [
      ...lines,
      "",
      t.total(gifts.length, formatCount(coins)),
      economy.giftApplied ? t.alreadyApplied : t.formula(formatCount(GIFT_CAP)),
    ].join("\n");
    await interaction.editReply({ embeds: [baseEmbed().setTitle(t.previewTitle).setDescription(description)] });
  },
};
