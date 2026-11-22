import { SlashCommandBuilder, time, TimestampStyles } from "discord.js";
import { baseEmbed } from "../util/embeds.js";
import { safeText } from "../util/escape.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

const t = texts.saga;

export const saga: Command = {
  data: new SlashCommandBuilder().setName("saga").setDescription("Una crónica de las últimas hazañas del reino"),

  async execute(interaction, { chronicle }) {
    const events = chronicle.recent(["death", "advancement"], 10);
    const lines = events.map((e) => {
      const when = time(e.at, TimestampStyles.RelativeTime);
      if (e.type === "death") {
        const emoji = e.combat ? t.deathEmoji.combat : t.deathEmoji.hel;
        return `${emoji} ${safeText(e.spanish ?? e.english, 200)} · ${when}`;
      }
      return `${t.advancementEmoji[e.kind]} **${safeText(e.player, 32)}** · [${safeText(e.title, 100)}] · ${when}`;
    });

    const description = lines.length > 0 ? `${lines.join("\n")}\n\n${t.note}` : t.empty;
    await interaction.editReply({ embeds: [baseEmbed().setTitle(t.title).setDescription(description)] });
  },
};
