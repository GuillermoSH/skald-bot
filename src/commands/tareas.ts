import { SlashCommandBuilder, time, TimestampStyles } from "discord.js";
import { TASK_REWARD, tasksForDay, type TaskDef } from "../core/tasks.js";
import { zonedToUtc } from "../core/when.js";
import { asset } from "../util/assets.js";
import { baseEmbed } from "../util/embeds.js";
import { safeText } from "../util/escape.js";
import { formatCount } from "../util/format.js";
import { texts } from "../util/texts.js";
import type { Command } from "./types.js";

const t = texts.tareas;

export const taskName = (task: TaskDef) => (t.names[task.id] ?? (() => task.id))(formatCount(task.target));

/** Medianoche del día siguiente en la zona horaria del reino (cuándo cambian). */
export function nextReset(day: string, timeZone: string): Date | null {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return zonedToUtc({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: 0, minute: 0 }, timeZone);
}

export const tareas: Command = {
  data: new SlashCommandBuilder().setName("tareas").setDescription("Las tres misiones del día, tu progreso y tu racha"),

  async execute(interaction, ctx) {
    const daily = ctx.realm.tasks;
    if (!daily) {
      await interaction.editReply({ content: t.unavailable });
      return;
    }
    const day = daily.today();
    const tasks = tasksForDay(day);
    const lines = tasks.map((task) => t.line(t.tier[task.tier], taskName(task), formatCount(TASK_REWARD[task.tier])));

    const out = [...lines, ""];
    const link = ctx.realm.links?.byDiscord(interaction.user.id);
    const player = link ? (await ctx.world.players()).find((p) => p.uuid === link.uuid) : undefined;
    if (link && player) {
      out.push(t.yourHeading(safeText(link.mcName, 16)));
      for (const p of daily.progressFor(player)) {
        out.push(`${p.done ? t.done : t.tier[p.task.tier]} ${taskName(p.task)} · ${p.done ? t.done : t.progress(formatCount(Math.floor(p.progress)), formatCount(p.task.target))}`);
      }
      const streak = daily.streakOf(link.uuid);
      out.push("", streak ? t.streak(streak.current, streak.best) : t.noStreak);
    } else {
      out.push(t.notLinked);
    }
    out.push(t.bonusNote);
    const reset = nextReset(day, ctx.config.TIMEZONE);
    if (reset) out.push(t.resets(time(reset, TimestampStyles.RelativeTime)));

    const embed = baseEmbed().setTitle(t.title).setDescription(out.join("\n"));
    const image = asset("tareas.png");
    if (image) embed.setThumbnail(image.url);
    await interaction.editReply({ embeds: [embed], files: image ? [image.file] : [] });
  },
};
