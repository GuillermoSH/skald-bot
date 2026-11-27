/**
 * Tareas diarias: tres misiones al día, las mismas para todos (una fácil, una media y
 * una difícil), sorteadas con la fecha como semilla. El progreso es lo que suben las
 * estadísticas desde que empezó el día (o desde que Skald vio al jugador ese día).
 * Cumplir una da monedas; cumplir las tres suma racha y un extra que crece con ella.
 */
import { createHash } from "node:crypto";
import type { Database } from "./db.js";
import { dayIn } from "./economy.js";
import { isLogBlock } from "./metrics.js";
import { stat, sumStats, type PlayerRecord } from "./stats.js";

export type TaskTier = "easy" | "medium" | "hard";

export interface TaskDef {
  id: string;
  tier: TaskTier;
  target: number;
  /** Valor acumulado de la estadística (el progreso es la diferencia en el día). */
  value(p: PlayerRecord): number;
}

const killed = (mob: string) => (p: PlayerRecord) => stat(p, "killed", mob);
const custom = (key: string) => (p: PlayerRecord) => stat(p, "custom", key);
const distanceKm = (p: PlayerRecord) => sumStats(p, "custom", (k) => k.endsWith("_one_cm") && k !== "minecraft:fall_one_cm") / 100_000;
const ores = (...names: string[]) => (p: PlayerRecord) => names.reduce((n, b) => n + stat(p, "mined", b), 0);

export const TASKS: readonly TaskDef[] = [
  // Fáciles
  { id: "kill_mobs_easy", tier: "easy", target: 10, value: custom("mob_kills") },
  { id: "mine_blocks_easy", tier: "easy", target: 64, value: (p) => sumStats(p, "mined") },
  { id: "travel_easy", tier: "easy", target: 1, value: distanceKm },
  { id: "fish_easy", tier: "easy", target: 3, value: custom("fish_caught") },
  { id: "sleep", tier: "easy", target: 1, value: custom("sleep_in_bed") },
  { id: "breed_easy", tier: "easy", target: 4, value: custom("animals_bred") },
  // Medias
  { id: "kill_zombies", tier: "medium", target: 15, value: killed("zombie") },
  { id: "kill_skeletons", tier: "medium", target: 10, value: killed("skeleton") },
  { id: "chop_logs", tier: "medium", target: 32, value: (p) => sumStats(p, "mined", isLogBlock) },
  { id: "travel_medium", tier: "medium", target: 3, value: distanceKm },
  { id: "mine_iron", tier: "medium", target: 10, value: ores("iron_ore", "deepslate_iron_ore") },
  { id: "trade", tier: "medium", target: 6, value: custom("traded_with_villager") },
  // Difíciles
  { id: "kill_creepers", tier: "hard", target: 5, value: killed("creeper") },
  { id: "kill_endermen", tier: "hard", target: 3, value: killed("enderman") },
  { id: "mine_diamonds", tier: "hard", target: 3, value: ores("diamond_ore", "deepslate_diamond_ore") },
  { id: "kill_mobs_hard", tier: "hard", target: 40, value: custom("mob_kills") },
  { id: "travel_hard", tier: "hard", target: 8, value: distanceKm },
  { id: "mine_blocks_hard", tier: "hard", target: 500, value: (p) => sumStats(p, "mined") },
];

export const TASK_REWARD: Readonly<Record<TaskTier, number>> = { easy: 15, medium: 30, hard: 50 };
/** Extra por cumplir las tres: 10 × días de racha, hasta 7. */
export const streakBonus = (streak: number) => 10 * Math.min(Math.max(streak, 1), 7);
export const TASK_REASON_PREFIX = "task:";
export const STREAK_REASON = "streak";

/** Las tres misiones del día (una de cada dificultad), iguales para todos. */
export function tasksForDay(day: string): TaskDef[] {
  const hash = createHash("sha256").update(`skald-tareas:${day}`).digest();
  return (["easy", "medium", "hard"] as const).map((tier, i) => {
    const pool = TASKS.filter((t) => t.tier === tier);
    return pool[(hash[i] ?? 0) % pool.length] as TaskDef;
  });
}

/** El día anterior a "AAAA-MM-DD". */
function previousDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface TaskProgress {
  task: TaskDef;
  progress: number;
  done: boolean;
}

export interface TaskEvent {
  uuid: string;
  task: TaskDef;
  coins: number;
  /** Si con esta se completan las tres: racha y extra. */
  streak: { days: number; bonus: number } | null;
}

export class DailyTasks {
  constructor(
    private readonly db: Database,
    private readonly timeZone: string,
    /** Donde se apuntan las monedas (null = la economía está apagada: solo progreso). */
    private readonly pay: ((uuid: string, amount: number, reason: string, day: string) => void) | null,
  ) {}

  today(now = new Date()): string {
    return dayIn(this.timeZone, now);
  }

  /** Revisa el progreso de todos; devuelve las misiones recién cumplidas. */
  tick(players: readonly PlayerRecord[], now = new Date()): TaskEvent[] {
    const day = this.today(now);
    const tasks = tasksForDay(day);
    const at = now.toISOString();
    return this.db.transaction(() => {
      this.db.run("DELETE FROM daily_baselines WHERE day < ?", previousDay(previousDay(day)));
      const events: TaskEvent[] = [];
      for (const player of players) {
        for (const p of this.progressOf(player, tasks, day)) {
          if (p.done || p.progress < p.task.target) continue;
          this.db.run("INSERT OR IGNORE INTO daily_done (day, uuid, task, at) VALUES (?, ?, ?, ?)", day, player.uuid, p.task.id, at);
          const coins = TASK_REWARD[p.task.tier];
          this.pay?.(player.uuid, coins, `${TASK_REASON_PREFIX}${p.task.id}`, day);
          events.push({ uuid: player.uuid, task: p.task, coins, streak: this.maybeStreak(player.uuid, tasks, day) });
        }
      }
      return events;
    });
  }

  /** Progreso de un jugador en las misiones de hoy (sin cambiar nada salvo el punto de partida). */
  progressFor(player: PlayerRecord, now = new Date()): TaskProgress[] {
    const day = this.today(now);
    return this.progressOf(player, tasksForDay(day), day);
  }

  streakOf(uuid: string): { current: number; best: number; lastDay: string } | null {
    const r = this.db.get<{ current: number; best: number; last_day: string }>("SELECT * FROM streaks WHERE uuid = ?", uuid);
    return r ? { current: r.current, best: r.best, lastDay: r.last_day } : null;
  }

  private progressOf(player: PlayerRecord, tasks: readonly TaskDef[], day: string): TaskProgress[] {
    const done = new Set(
      this.db.all<{ task: string }>("SELECT task FROM daily_done WHERE day = ? AND uuid = ?", day, player.uuid).map((r) => r.task),
    );
    return tasks.map((task) => {
      const current = task.value(player);
      const key = task.id;
      let base = this.db.get<{ value: number }>("SELECT value FROM daily_baselines WHERE day = ? AND uuid = ? AND metric = ?", day, player.uuid, key)?.value;
      if (base === undefined || current < base) {
        // Primera vez hoy (o la estadística bajó): se empieza a contar desde aquí.
        this.db.run(
          "INSERT INTO daily_baselines (day, uuid, metric, value) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET value = excluded.value",
          day,
          player.uuid,
          key,
          current,
        );
        base = current;
      }
      return { task, progress: Math.max(0, current - base), done: done.has(task.id) };
    });
  }

  /** Si ya están las tres de hoy, suma racha (una vez al día) y paga el extra. */
  private maybeStreak(uuid: string, tasks: readonly TaskDef[], day: string): { days: number; bonus: number } | null {
    const done = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM daily_done WHERE day = ? AND uuid = ?", day, uuid)?.n ?? 0;
    if (done < tasks.length) return null;
    const prev = this.streakOf(uuid);
    if (prev?.lastDay === day) return null;
    const days = prev?.lastDay === previousDay(day) ? prev.current + 1 : 1;
    const best = Math.max(days, prev?.best ?? 0);
    this.db.run(
      "INSERT INTO streaks (uuid, current, best, last_day) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET current = excluded.current, best = excluded.best, last_day = excluded.last_day",
      uuid,
      days,
      best,
      day,
    );
    const bonus = streakBonus(days);
    this.pay?.(uuid, bonus, STREAK_REASON, day);
    return { days, bonus };
  }
}
