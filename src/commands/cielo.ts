import { SlashCommandBuilder } from "discord.js";
import { describeClock, readWeather, readWorldClock, type WeatherInfo } from "../core/sky.js";
import { getServerStatus } from "../core/status.js";
import { asset } from "../util/assets.js";
import { baseEmbed, COLORS } from "../util/embeds.js";
import { formatCount } from "../util/format.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

const t = texts.cielo;
/** Ticks → minutos de juego (reales, con alguien conectado). */
const minutes = (ticks: number) => formatCount(Math.max(1, Math.round(ticks / 20 / 60)));

export function describeWeather(w: WeatherInfo): string {
  if (w.raining && w.thundering) return `${t.thunder} · ${t.rainEnds(minutes(Math.min(w.rainTicks, w.thunderTicks)))}`;
  if (w.raining) return `${t.rain} · ${t.rainEnds(minutes(w.rainTicks))}`;
  if (w.clearTicks > 0) return `${t.clear} · ${t.clearForced(minutes(w.clearTicks))}`;
  return w.rainTicks > 0 ? `${t.clear} · ${t.rainStarts(minutes(w.rainTicks))}` : t.clear;
}

export const cielo: Command = {
  data: new SlashCommandBuilder().setName("cielo").setDescription("El cielo del reino: hora, día, fase de la luna y clima"),

  async execute(interaction, { config, rcon }) {
    const [status, liveTicks, weather] = await Promise.all([
      getServerStatus(config.MC_HOST, config.MC_PORT, config.RCON_TIMEOUT_MS),
      rcon.queryTime().catch(() => null),
      readWeather(config.DATA_DIR).catch(() => null),
    ]);
    // Sin RCON, el reloj del último guardado (puede ir hasta ~5 min por detrás).
    const ticks = liveTicks ?? (await readWorldClock(config.DATA_DIR).catch(() => null));
    if (ticks === null) {
      await interaction.editReply({ embeds: [baseEmbed(COLORS.error).setDescription(t.unavailable)] });
      return;
    }

    const clock = describeClock(ticks);
    const time = `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
    const embed = baseEmbed()
      .setTitle(t.title)
      .addFields(
        { name: t.time, value: `${t.period[clock.period]} · **${time}**`, inline: true },
        { name: t.day, value: t.dayValue(formatCount(clock.day)), inline: true },
        { name: t.moon, value: t.moonNames[clock.moonPhase] ?? "?", inline: true },
      );
    if (weather) embed.addFields({ name: t.weather, value: describeWeather(weather) });

    const lines: string[] = [];
    if (status.online && status.playersOnline === 0) lines.push(t.paused);
    const hint = t.moonHint[clock.moonPhase];
    if (hint && (clock.period === "night" || clock.period === "dusk")) lines.push(hint);
    if (lines.length > 0) embed.setDescription(lines.join("\n"));
    embed.addFields({ name: "​", value: liveTicks === null ? `${t.staleClock}\n${t.note}` : t.note });

    const image = asset(`luna-${clock.moonPhase}.png`);
    if (image) embed.setThumbnail(image.url);
    await interaction.editReply({ embeds: [embed], files: image ? [image.file] : [] });
  },
};
