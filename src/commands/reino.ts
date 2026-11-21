import { SlashCommandBuilder } from "discord.js";
import type { TickInfo } from "../core/parsers.js";
import { RconUnavailableError } from "../core/rcon.js";
import { getServerStatus } from "../core/status.js";
import { baseEmbed, COLORS } from "../util/embeds.js";
import { safeText } from "../util/escape.js";
import { log } from "../util/log.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

export const reino: Command = {
  data: new SlashCommandBuilder().setName("reino").setDescription("Estado del reino: jugadores, TPS y latencia"),

  async execute(interaction, { config, rcon }) {
    const [status, tick] = await Promise.all([
      getServerStatus(config.MC_HOST, config.MC_PORT, config.RCON_TIMEOUT_MS),
      // Si RCON falla, se enseña el ping igualmente.
      rcon.queryTick().catch((error: unknown) => {
        if (!(error instanceof RconUnavailableError)) throw error;
        log.warn(`/reino sin TPS: ${error.message}`);
        return null;
      }),
    ]);

    if (!status.online) {
      await interaction.editReply({
        embeds: [baseEmbed(COLORS.error).setTitle(texts.realmOfflineTitle).setDescription(texts.realmOfflineBody)],
      });
      return;
    }

    const f = texts.realmFields;
    const lines = [texts.realmOnlineBody(status.playersOnline)];
    const embed = baseEmbed(COLORS.ok)
      .setTitle(texts.realmOnlineTitle)
      .addFields({ name: f.warriors, value: `${status.playersOnline}/${status.playersMax}`, inline: true });

    if (tick) {
      const perf = describePerformance(tick);
      embed.addFields(
        { name: f.tps, value: `${fmt(perf.tps)} / ${fmt(tick.targetRate)}`, inline: true },
        { name: f.mspt, value: `${fmt(tick.averageMs)} ms de ${fmt(perf.budgetMs)} ms`, inline: true },
      );
      const state = texts.tickState[tick.state];
      lines.push(state ?? texts.loadVerdict(perf.load));
      if (perf.load > 1 && tick.state === "normal") embed.setColor(COLORS.main);
    } else {
      lines.push(texts.realmNoTicks);
    }

    embed
      .setDescription(lines.join("\n"))
      .addFields(
        { name: f.latency, value: `${status.latencyMs} ms`, inline: true },
        { name: f.version, value: safeText(status.version, 64), inline: true },
      );
    await interaction.editReply({ embeds: [embed] });
  },
};

export function describePerformance(tick: TickInfo): { tps: number; budgetMs: number; load: number } {
  const budgetMs = tick.targetMs ?? 1000 / tick.targetRate;
  // TPS real aproximado: no puede pasar del objetivo; si va lento, 1000 / MSPT.
  const tps = Math.min(tick.targetRate, 1000 / Math.max(tick.averageMs, 0.001));
  return { tps, budgetMs, load: tick.averageMs / budgetMs };
}

function fmt(n: number): string {
  return n.toLocaleString("es-ES", { maximumFractionDigits: 1 });
}
