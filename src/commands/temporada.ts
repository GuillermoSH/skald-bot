import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  time,
  TimestampStyles,
  type ButtonInteraction,
  type Client,
  type ModalSubmitInteraction,
} from "discord.js";
import { alertChannelFor } from "../alerts.js";
import type { Season } from "../core/seasons.js";
import { asset } from "../util/assets.js";
import { fetchSendableChannel } from "../util/channels.js";
import { log } from "../util/log.js";
import { METRICS } from "../core/metrics.js";
import type { FinalRanking } from "../realm.js";
import { FINAL_RANKING_METRICS } from "../realm.js";
import { baseEmbed } from "../util/embeds.js";
import { safeText } from "../util/escape.js";
import { formatCount, formatMetric } from "../util/format.js";
import { texts } from "../util/texts.js";
import type { Command, CommandContext } from "./types.js";

const t = texts.temporada;

export const temporada: Command = {
  data: new SlashCommandBuilder()
    .setName("temporada")
    .setDescription("Las eras del reino: cada mundo es una era")
    .addSubcommand((s) => s.setName("actual").setDescription(t.actualDescription))
    .addSubcommand((s) => s.setName("historial").setDescription(t.historialDescription))
    .addSubcommand((s) =>
      s
        .setName("nueva")
        .setDescription(t.nuevaDescription)
        .addStringOption((o) => o.setName(t.nameOption).setDescription(t.nameOptionDescription).setRequired(true).setMaxLength(40)),
    ),

  async execute(interaction, ctx) {
    const { realm } = ctx;
    const seasons = realm.seasons;
    if (!seasons) {
      await interaction.editReply({ content: t.unavailable });
      return;
    }

    switch (interaction.options.getSubcommand()) {
      case "nueva": {
        if (!ctx.config.ADMIN_USER_IDS.includes(interaction.user.id)) {
          await interaction.editReply({ content: t.onlyJarl });
          return;
        }
        const lines = await openEra(interaction.client, ctx, interaction.options.getString(t.nameOption, true));
        await interaction.editReply({ content: lines.join("\n") });
        return;
      }

      case "historial": {
        const past = seasons.list().filter((s) => s.endedAt !== null);
        if (past.length === 0) {
          await interaction.editReply({ embeds: [baseEmbed().setTitle(t.historyTitle).setDescription(t.noHistory)] });
          return;
        }
        const blocks = await Promise.all(past.slice(0, 10).map((s) => historyBlock(s, ctx)));
        await interaction.editReply({ embeds: [baseEmbed().setTitle(t.historyTitle).setDescription(blocks.join("\n\n"))] });
        return;
      }

      default: {
        const season = realm.season;
        if (!season) {
          await interaction.editReply({ content: t.unavailable });
          return;
        }
        const embed = baseEmbed()
          .setTitle(t.currentTitle(safeText(season.name, 40)))
          .addFields(
            { name: t.world, value: `\`${safeText(season.levelName, 40)}\``, inline: true },
            { name: t.since, value: time(new Date(season.startedAt), TimestampStyles.LongDate), inline: true },
          );
        const pending = realm.pendingLevelName;
        if (pending) embed.setDescription(t.paused(safeText(pending, 40)));
        await interaction.editReply({ embeds: [embed] });
      }
    }
  },
};

/** Abre la era (cierra la actual), la anuncia y devuelve la respuesta para el admin. */
async function openEra(client: Client<true>, ctx: CommandContext, rawName: string): Promise<string[]> {
  const name = safeText(rawName.trim(), 40) || t.defaultName((ctx.realm.seasons?.count ?? 0) + 1);
  const sameWorld = ctx.realm.pendingLevelName === null;
  const { closed, opened } = await ctx.realm.openSeason(name);
  const lines = [t.opened(closed ? safeText(closed.name, 40) : null, safeText(opened.name, 40))];
  if (sameWorld && closed) lines.push(t.sameWorld(safeText(opened.levelName, 40)));
  const announced = await announceEra(client, ctx, closed, opened.name);
  if (announced > 0) lines.push(t.announced(announced));
  return lines;
}

// ---- propuesta en el canal de administración (botón → formulario con el nombre)

export const SEASON_BUTTON_ID = "skald:season:open";
const SEASON_MODAL_ID = "skald:season:name";
const NAME_INPUT_ID = "name";

export function seasonProposalRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(SEASON_BUTTON_ID).setLabel(t.proposalButton).setEmoji("🔥").setStyle(ButtonStyle.Primary),
  );
}

export async function handleSeasonButton(interaction: ButtonInteraction, ctx: CommandContext): Promise<void> {
  if (!ctx.config.ADMIN_USER_IDS.includes(interaction.user.id)) {
    await interaction.reply({ content: t.onlyJarl, flags: MessageFlags.Ephemeral });
    return;
  }
  const input = new TextInputBuilder()
    .setCustomId(NAME_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setMaxLength(40)
    .setRequired(true)
    .setValue(t.defaultName((ctx.realm.seasons?.count ?? 0) + 1));
  const modal = new ModalBuilder()
    .setCustomId(SEASON_MODAL_ID)
    .setTitle(t.modalTitle)
    .addLabelComponents(new LabelBuilder().setLabel(t.modalLabel).setDescription(t.modalDescription).setTextInputComponent(input));
  await interaction.showModal(modal);
}

export function isSeasonModal(customId: string): boolean {
  return customId === SEASON_MODAL_ID;
}

export async function handleSeasonModal(interaction: ModalSubmitInteraction, ctx: CommandContext): Promise<void> {
  if (!ctx.config.ADMIN_USER_IDS.includes(interaction.user.id)) {
    await interaction.reply({ content: t.onlyJarl, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const lines = await openEra(interaction.client, ctx, interaction.fields.getTextInputValue(NAME_INPUT_ID));
  await interaction.editReply({ content: lines.join("\n") });
  // El aviso ya no hace falta: se quita el botón y se dice quién la abrió.
  const opened = ctx.realm.season;
  if (interaction.message && opened) {
    await interaction.message
      .edit({ components: [], content: t.proposalDone(safeText(opened.name, 40), `<@${interaction.user.id}>`), allowedMentions: { parse: [] } })
      .catch(() => undefined);
  }
}

/**
 * Anuncio público de la era nueva en los canales de avisos del servidor y de los
 * logros (sin repetir canal): el GIF suelto (se ve más grande que dentro de un
 * embed) con el titular, y después el resumen de la era que termina.
 */
async function announceEra(client: Client<true>, ctx: CommandContext, closed: Season | null, opened: string): Promise<number> {
  const routes = alertChannelFor(ctx.config);
  const ids = new Set([routes.get("server"), routes.get("advancement")].filter((id): id is string => id !== undefined));
  const summary = closed ? baseEmbed().setTitle(t.summaryTitle(safeText(closed.name, 40))).setDescription(await historyBlock(closed, ctx)) : null;
  let sent = 0;
  for (const id of ids) {
    const channel = await fetchSendableChannel(client, id, "anuncio de era");
    if (!channel) continue;
    try {
      const image = asset("era.gif");
      await channel.send({ content: t.announce(safeText(opened, 40)), files: image ? [image.file] : [], allowedMentions: { parse: [] } });
      if (summary) await channel.send({ embeds: [summary], allowedMentions: { parse: [] } });
      sent++;
    } catch (error) {
      log.warn(`No se pudo anunciar la era en ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return sent;
}

async function historyBlock(
  season: { name: string; startedAt: string; endedAt: string | null; finalRanking: string | null },
  { names }: CommandContext,
): Promise<string> {
  const from = time(new Date(season.startedAt), TimestampStyles.ShortDate);
  const to = season.endedAt ? time(new Date(season.endedAt), TimestampStyles.ShortDate) : null;
  const lines = [t.historyLine(safeText(season.name, 40), from, to)];
  const ranking = parseRanking(season.finalRanking);
  const champions = FINAL_RANKING_METRICS.flatMap((m) => {
    const best = ranking[m]?.[0];
    return best ? [{ metric: m, ...best }] : [];
  });
  const richest = ranking.coins?.[0];
  const resolved = await names.resolve([...champions.map((c) => c.uuid), ...(richest ? [richest.uuid] : [])]);
  for (const c of champions) {
    const category = texts.gestas.categories[c.metric];
    const name = safeText(resolved.get(c.uuid) ?? texts.unknownWarrior(c.uuid), 32);
    lines.push(t.champion(`${category.emoji} ${category.label}`, name, formatMetric(METRICS[c.metric].unit, c.value)));
  }
  if (richest) {
    const name = safeText(resolved.get(richest.uuid) ?? texts.unknownWarrior(richest.uuid), 32);
    lines.push(t.champion(t.richest, name, formatCount(richest.value)));
  }
  return lines.join("\n");
}

function parseRanking(raw: string | null): FinalRanking {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as FinalRanking;
  } catch {
    return {};
  }
}
