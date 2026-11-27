import { SlashCommandBuilder } from "discord.js";
import type { Translator } from "../core/lang.js";
import { BOOK_ENCHANTMENTS, type Prize } from "../core/loot.js";
import { asset } from "../util/assets.js";
import { baseEmbed } from "../util/embeds.js";
import { formatCount } from "../util/format.js";
import { roman, texts } from "../util/texts.js";
import type { SpinFailure } from "../roulette.js";
import type { Command } from "./types.js";

const t = texts.ruleta;

/** El premio en español (nombres oficiales de objetos y encantamientos). */
export function describePrize(prize: Prize, lang: Pick<Translator, "blockOrItem" | "fromKey">): string {
  switch (prize.kind) {
    case "nothing":
      return t.nothing;
    case "coins":
      return prize.group === "jackpot" ? t.jackpot(formatCount(prize.coins)) : t.refund(formatCount(prize.coins));
    case "item":
      return t.item(formatCount(prize.count), lang.blockOrItem(prize.id));
    case "book": {
      const names = prize.enchantments.map((e) => {
        const name = lang.fromKey(`enchantment.minecraft.${e.id}`);
        // Los de un solo nivel (Reparación, Toque de seda) van sin número, como en el juego.
        if (BOOK_ENCHANTMENTS.find((b) => b.id === e.id)?.max === 1) return name;
        const level = lang.fromKey(`enchantment.level.${e.level}`);
        return `${name} ${level.startsWith("Level") ? roman(e.level) : level}`;
      });
      return t.book(names.join(" y "));
    }
  }
}

export const failureText = (reason: SpinFailure, balance?: number): string =>
  reason === "poor" ? t.poor(formatCount(balance ?? 0)) : { economy_off: t.economyOff, offline: t.offline, limit: t.limit, busy: t.busy, give_failed: t.giveFailed, poor: "" }[reason];

export const ruleta: Command = {
  data: new SlashCommandBuilder().setName("ruleta").setDescription("Gira la rueda de las nornas: 100 monedas, un premio al azar (hasta 5 al día)"),
  ephemeral: true,

  async execute(interaction, ctx) {
    const link = ctx.realm.links?.byDiscord(interaction.user.id);
    if (!link || link.status !== "active") {
      await interaction.editReply({ content: t.notLinked });
      return;
    }
    if (!ctx.roulette) {
      await interaction.editReply({ content: t.economyOff });
      return;
    }
    const result = await ctx.roulette.spin(link.uuid, link.mcName);
    if (!result.ok) {
      await interaction.editReply({ content: failureText(result.reason, result.balance) });
      return;
    }
    await ctx.lang.ready();
    const embed = baseEmbed()
      .setTitle(t.title)
      .setDescription(`## ${t.groups[result.prize.group]}\n${describePrize(result.prize, ctx.lang)}\n\n${t.after(formatCount(result.balance), result.spinsLeft)}`);
    const image = asset("ruleta.gif");
    if (image) embed.setThumbnail(image.url);
    await interaction.editReply({ embeds: [embed], files: image ? [image.file] : [] });
  },
};
