import { SlashCommandBuilder, time, TimestampStyles } from "discord.js";
import { TASK_REWARD, type TaskDef, type WeeklyMissionDef, type WeeklyStatus } from "../core/tasks.js";
import { zonedToUtc } from "../core/when.js";
import { asset } from "../util/assets.js";
import { baseEmbed } from "../util/embeds.js";
import { safeText } from "../util/escape.js";
import { formatCount } from "../util/format.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

const t = texts.tareas;
const fmtTarget = (n: number) => formatCount(n);

export const taskName = (task: TaskDef) => (t.names[task.id] ?? (() => task.id))(fmtTarget(task.target));
export const weeklyName = (m: WeeklyMissionDef) => (t.weeklyNames[m.id] ?? (() => m.id))(fmtTarget(m.target));

/** Barra de progreso con bloques (10 casillas). */
export function progressBar(now: number, target: number): string {
  const filled = Math.max(0, Math.min(10, Math.floor((now / target) * 10)));
  return "▰".repeat(filled) + "▱".repeat(10 - filled);
}

/** Medianoche del día siguiente en la zona horaria del reino (cuándo cambian). */
export function nextReset(day: string, timeZone: string): Date | null {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return zonedToUtc({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: 0, minute: 0 }, timeZone);
}

/** Las líneas de la misión semanal (con tu aporte si se sabe quién eres). */
export function weeklyLines(s: WeeklyStatus, uuid: string | null): string[] {
  const lines = [t.weeklyHeading, `**${weeklyName(s.mission)}**`];
  if (s.completedAt) lines.push(t.weeklyDone);
  else lines.push(t.weeklyProgress(progressBar(s.total, s.mission.target), formatCount(Math.floor(s.total)), fmtTarget(s.mission.target)));
  const mine = uuid ? s.contributions.get(uuid) : undefined;
  if (mine) lines.push(t.weeklyYours(formatCount(Math.floor(mine))));
  if (!s.completedAt) lines.push(t.weeklyReward);
  return lines;
}

export const tareas: Command = {
  data: new SlashCommandBuilder()
    .setName("tareas")
    .setDescription("Tus tres misiones del día, tu racha y la misión del reino de la semana")
    .addIntegerOption((o) => o.setName(t.rerollOption).setDescription(t.rerollOptionDescription).setMinValue(1).setMaxValue(3)),

  async execute(interaction, ctx) {
    const daily = ctx.realm.tasks;
    const weekly = ctx.realm.weeklyMission;
    if (!daily || !weekly) {
      await interaction.editReply({ content: t.unavailable });
      return;
    }
    const players = await ctx.world.players();
    const link = ctx.realm.links?.byDiscord(interaction.user.id);
    const player = link ? players.find((p) => p.uuid === link.uuid) : undefined;
    const out: string[] = [];

    if (link && player) {
      const slot = interaction.options.getInteger(t.rerollOption);
      if (slot !== null) {
        const r = daily.reroll(player, slot);
        out.push(r.ok ? t.rerolled(taskName(r.old), taskName(r.task)) : t.rerollFail[r.reason], "");
      }
      const progress = daily.progressFor(player);
      for (const p of progress) {
        const state = p.done ? t.done : t.progress(formatCount(Math.floor(p.progress)), fmtTarget(p.task.target));
        out.push(`**${p.slot}.** ${t.tier[p.task.tier]} ${taskName(p.task)} · ${state} · 🪙 ${formatCount(TASK_REWARD[p.task.tier])}`);
      }
      const streak = daily.streakOf(player.uuid);
      out.push("", streak ? t.streak(streak.current, streak.best) : t.noStreak, t.bonusNote, t.rerollHint);
    } else {
      out.push(t.notLinked);
    }

    out.push("", ...weeklyLines(weekly.status(players), player?.uuid ?? null));
    const reset = nextReset(daily.today(), ctx.config.TIMEZONE);
    if (reset) out.push(t.resets(time(reset, TimestampStyles.RelativeTime)));

    const embed = baseEmbed()
      .setTitle(link ? `${t.title} · ${safeText(link.mcName, 16)}` : t.title)
      .setDescription(out.join("\n"));
    const image = asset("tareas.png");
    if (image) embed.setThumbnail(image.url);
    await interaction.editReply({ embeds: [embed], files: image ? [image.file] : [] });
  },
};
