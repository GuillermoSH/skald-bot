/**
 * Misiones.
 *
 * Diarias (individuales): cada jugador tiene tres al día, una fácil, una media y una
 * difícil, sorteadas para él la primera vez que Skald lo ve ese día y guardadas. Las
 * del Nether y del End solo le salen si ya tiene el logro de haber entrado. Puede
 * cambiar una al día pagando. El progreso es lo que suben sus estadísticas en el día.
 * Cumplir una da monedas; cumplir las tres suma racha y un extra que crece con ella.
 *
 * Semanal (del reino): una por semana (de lunes a domingo) para todos; el progreso es
 * la suma de lo que aporta cada uno. Al cumplirse, todos los que han aportado reciben
 * el mismo premio.
 */
import type { Database } from "./db.js";
import { dayIn } from "./economy.js";
import { cryptoRng, type Rng } from "./loot.js";
import { isLogBlock } from "./metrics.js";
import { stat, sumStats, type PlayerRecord } from "./stats.js";

export type TaskTier = "easy" | "medium" | "hard";
export type Dimension = "nether" | "end";

export interface TaskDef {
  id: string;
  tier: TaskTier;
  target: number;
  /** Hace falta haber entrado en esa dimensión. */
  requires?: Dimension;
  /** Valor acumulado de la estadística (el progreso es la diferencia). */
  value(p: PlayerRecord): number;
}

const killed = (mob: string) => (p: PlayerRecord) => stat(p, "killed", mob);
const custom = (key: string) => (p: PlayerRecord) => stat(p, "custom", key);
const mined = (...blocks: string[]) => (p: PlayerRecord) => blocks.reduce((n, b) => n + stat(p, "mined", b), 0);
const distanceKm = (p: PlayerRecord) => sumStats(p, "custom", (k) => k.endsWith("_one_cm") && k !== "minecraft:fall_one_cm") / 100_000;
const allMined = (p: PlayerRecord) => sumStats(p, "mined");

export const TASKS: readonly TaskDef[] = [
  // Fáciles
  { id: "kill_mobs_easy", tier: "easy", target: 25, value: custom("mob_kills") },
  { id: "mine_blocks_easy", tier: "easy", target: 160, value: allMined },
  { id: "travel_easy", tier: "easy", target: 2, value: distanceKm },
  { id: "fish_easy", tier: "easy", target: 6, value: custom("fish_caught") },
  { id: "breed_easy", tier: "easy", target: 8, value: custom("animals_bred") },
  { id: "kill_spiders", tier: "easy", target: 10, value: killed("spider") },
  { id: "kill_zombified_piglins", tier: "easy", target: 15, requires: "nether", value: killed("zombified_piglin") },
  // Medias
  { id: "kill_zombies", tier: "medium", target: 30, value: killed("zombie") },
  { id: "kill_skeletons", tier: "medium", target: 20, value: killed("skeleton") },
  { id: "chop_logs", tier: "medium", target: 64, value: (p) => sumStats(p, "mined", isLogBlock) },
  { id: "travel_medium", tier: "medium", target: 5, value: distanceKm },
  { id: "mine_iron", tier: "medium", target: 24, value: mined("iron_ore", "deepslate_iron_ore") },
  { id: "trade", tier: "medium", target: 12, value: custom("traded_with_villager") },
  { id: "kill_blazes", tier: "medium", target: 8, requires: "nether", value: killed("blaze") },
  { id: "mine_quartz", tier: "medium", target: 48, requires: "nether", value: mined("nether_quartz_ore") },
  { id: "mine_end_stone", tier: "medium", target: 128, requires: "end", value: mined("end_stone") },
  // Difíciles
  { id: "kill_creepers", tier: "hard", target: 12, value: killed("creeper") },
  { id: "kill_endermen", tier: "hard", target: 6, value: killed("enderman") },
  { id: "mine_diamonds", tier: "hard", target: 6, value: mined("diamond_ore", "deepslate_diamond_ore") },
  { id: "kill_mobs_hard", tier: "hard", target: 80, value: custom("mob_kills") },
  { id: "travel_hard", tier: "hard", target: 12, value: distanceKm },
  { id: "mine_blocks_hard", tier: "hard", target: 1200, value: allMined },
  { id: "mine_ancient_debris", tier: "hard", target: 3, requires: "nether", value: mined("ancient_debris") },
  { id: "kill_wither_skeletons", tier: "hard", target: 10, requires: "nether", value: killed("wither_skeleton") },
  { id: "kill_shulkers", tier: "hard", target: 6, requires: "end", value: killed("shulker") },
];

export const TASK_REWARD: Readonly<Record<TaskTier, number>> = { easy: 15, medium: 30, hard: 50 };
/** Extra por cumplir las tres: 10 × días de racha, hasta 7. */
export const streakBonus = (streak: number) => 10 * Math.min(Math.max(streak, 1), 7);
export const REROLL_COST = 20;
export const TASK_REASON_PREFIX = "task:";
export const STREAK_REASON = "streak";
export const REROLL_REASON = "task_reroll";
const TIERS: readonly TaskTier[] = ["easy", "medium", "hard"];

/** Logros de haber entrado en cada dimensión (ids de 26.2). */
const REALM_ADVANCEMENT: Readonly<Record<Dimension, string>> = {
  nether: "minecraft:story/enter_the_nether",
  end: "minecraft:story/enter_the_end",
};

export function hasDimension(p: PlayerRecord, realm: Dimension): boolean {
  return p.advancements.some((a) => a.id === REALM_ADVANCEMENT[realm]);
}

export const taskById = (id: string): TaskDef | undefined => TASKS.find((t) => t.id === id);

function eligible(p: PlayerRecord, tier: TaskTier, exclude: ReadonlySet<string>): TaskDef[] {
  return TASKS.filter((t) => t.tier === tier && !exclude.has(t.id) && (!t.requires || hasDimension(p, t.requires)));
}

/** El día anterior a "AAAA-MM-DD". */
export function previousDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface TaskProgress {
  slot: number;
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

export type RerollResult =
  | { ok: true; old: TaskDef; task: TaskDef }
  | { ok: false; reason: "bad_slot" | "done" | "used" | "poor" | "none" | "economy_off" };

export interface Wallet {
  balance(uuid: string): number;
  credit(uuid: string, amount: number, reason: string, day: string): void;
  debit(uuid: string, amount: number, reason: string, day: string): void;
}

export class DailyTasks {
  constructor(
    private readonly db: Database,
    private readonly timeZone: string,
    /** Donde van las monedas (null = economía apagada: solo progreso). */
    private readonly wallet: Wallet | null,
    private readonly rng: Rng = cryptoRng,
  ) {}

  today(now = new Date()): string {
    return dayIn(this.timeZone, now);
  }

  /** Revisa el progreso de todos; devuelve las misiones recién cumplidas. */
  tick(players: readonly PlayerRecord[], now = new Date()): TaskEvent[] {
    const day = this.today(now);
    const at = now.toISOString();
    return this.db.transaction(() => {
      const old = previousDay(previousDay(day));
      this.db.run("DELETE FROM daily_baselines WHERE day < ?", old);
      this.db.run("DELETE FROM daily_assignments WHERE day < ?", old);
      const events: TaskEvent[] = [];
      for (const player of players) {
        for (const p of this.progressOf(player, day)) {
          if (p.done || p.progress < p.task.target) continue;
          this.db.run("INSERT OR IGNORE INTO daily_done (day, uuid, task, at) VALUES (?, ?, ?, ?)", day, player.uuid, p.task.id, at);
          const coins = TASK_REWARD[p.task.tier];
          this.wallet?.credit(player.uuid, coins, `${TASK_REASON_PREFIX}${p.task.id}`, day);
          events.push({ uuid: player.uuid, task: p.task, coins, streak: this.maybeStreak(player.uuid, day) });
        }
      }
      return events;
    });
  }

  /** Las misiones de hoy de un jugador con su progreso (las sortea si aún no tiene). */
  progressFor(player: PlayerRecord, now = new Date()): TaskProgress[] {
    return this.db.transaction(() => this.progressOf(player, this.today(now)));
  }

  /** Cambia una misión (1-3) por otra de la misma dificultad, pagando, una vez al día. */
  reroll(player: PlayerRecord, slot: number, now = new Date()): RerollResult {
    if (!this.wallet) return { ok: false, reason: "economy_off" };
    const wallet = this.wallet;
    const day = this.today(now);
    return this.db.transaction((): RerollResult => {
      const current = this.progressOf(player, day);
      const target = current.find((p) => p.slot === slot);
      if (!target) return { ok: false, reason: "bad_slot" };
      if (target.done) return { ok: false, reason: "done" };
      const used = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM daily_assignments WHERE day = ? AND uuid = ? AND rerolled = 1", day, player.uuid)?.n ?? 0;
      if (used > 0) return { ok: false, reason: "used" };
      if (wallet.balance(player.uuid) < REROLL_COST) return { ok: false, reason: "poor" };
      const options = eligible(player, target.task.tier, new Set(current.map((p) => p.task.id)));
      const next = options[this.rng(options.length)];
      if (!next) return { ok: false, reason: "none" };
      wallet.debit(player.uuid, REROLL_COST, REROLL_REASON, day);
      this.db.run("UPDATE daily_assignments SET task = ?, rerolled = 1 WHERE day = ? AND uuid = ? AND slot = ?", next.id, day, player.uuid, slot);
      return { ok: true, old: target.task, task: next };
    });
  }

  streakOf(uuid: string): { current: number; best: number; lastDay: string } | null {
    const r = this.db.get<{ current: number; best: number; last_day: string }>("SELECT * FROM streaks WHERE uuid = ?", uuid);
    return r ? { current: r.current, best: r.best, lastDay: r.last_day } : null;
  }

  private assignments(player: PlayerRecord, day: string): { slot: number; task: TaskDef }[] {
    const rows = this.db.all<{ slot: number; task: string }>("SELECT slot, task FROM daily_assignments WHERE day = ? AND uuid = ? ORDER BY slot", day, player.uuid);
    const known = rows.map((r) => ({ slot: r.slot, task: taskById(r.task) })).filter((r): r is { slot: number; task: TaskDef } => r.task !== undefined);
    if (known.length === TIERS.length) return known;
    // Primera vez hoy: una de cada dificultad, entre las que puede hacer.
    this.db.run("DELETE FROM daily_assignments WHERE day = ? AND uuid = ?", day, player.uuid);
    const picked: { slot: number; task: TaskDef }[] = [];
    TIERS.forEach((tier, i) => {
      const options = eligible(player, tier, new Set());
      const task = options[this.rng(options.length)];
      if (!task) return;
      picked.push({ slot: i + 1, task });
      this.db.run("INSERT INTO daily_assignments (day, uuid, slot, task) VALUES (?, ?, ?, ?)", day, player.uuid, i + 1, task.id);
    });
    return picked;
  }

  private progressOf(player: PlayerRecord, day: string): TaskProgress[] {
    const done = new Set(this.db.all<{ task: string }>("SELECT task FROM daily_done WHERE day = ? AND uuid = ?", day, player.uuid).map((r) => r.task));
    return this.assignments(player, day).map(({ slot, task }) => {
      const current = task.value(player);
      let base = this.db.get<{ value: number }>("SELECT value FROM daily_baselines WHERE day = ? AND uuid = ? AND metric = ?", day, player.uuid, task.id)?.value;
      if (base === undefined || current < base) {
        // Primera vez (o la estadística bajó): se empieza a contar desde aquí.
        this.db.run(
          "INSERT INTO daily_baselines (day, uuid, metric, value) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET value = excluded.value",
          day,
          player.uuid,
          task.id,
          current,
        );
        base = current;
      }
      return { slot, task, progress: Math.max(0, current - base), done: done.has(task.id) };
    });
  }

  /** Si ya están las tres de hoy, suma racha (una vez al día) y paga el extra. */
  private maybeStreak(uuid: string, day: string): { days: number; bonus: number } | null {
    const assigned = this.db.all<{ task: string }>("SELECT task FROM daily_assignments WHERE day = ? AND uuid = ?", day, uuid).map((r) => r.task);
    const done = new Set(this.db.all<{ task: string }>("SELECT task FROM daily_done WHERE day = ? AND uuid = ?", day, uuid).map((r) => r.task));
    if (assigned.length < TIERS.length || !assigned.every((t) => done.has(t))) return null;
    const prev = this.streakOf(uuid);
    if (prev?.lastDay === day) return null;
    const days = prev?.lastDay === previousDay(day) ? prev.current + 1 : 1;
    this.db.run(
      "INSERT INTO streaks (uuid, current, best, last_day) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET current = excluded.current, best = excluded.best, last_day = excluded.last_day",
      uuid,
      days,
      Math.max(days, prev?.best ?? 0),
      day,
    );
    const bonus = streakBonus(days);
    this.wallet?.credit(uuid, bonus, STREAK_REASON, day);
    return { days, bonus };
  }
}

// ------------------------------------------------------------- semanal del reino

export interface WeeklyMissionDef {
  id: string;
  target: number;
  /** Solo si al menos la mitad de los que juegan han entrado en esa dimensión. */
  requires?: Dimension;
  value(p: PlayerRecord): number;
}

export const WEEKLY_MISSIONS: readonly WeeklyMissionDef[] = [
  { id: "kill_mobs", target: 1500, value: custom("mob_kills") },
  { id: "mine_blocks", target: 25_000, value: allMined },
  { id: "travel", target: 300, value: distanceKm },
  { id: "fish", target: 150, value: custom("fish_caught") },
  { id: "trade", target: 150, value: custom("traded_with_villager") },
  { id: "chop_logs", target: 1500, value: (p) => sumStats(p, "mined", isLogBlock) },
  { id: "kill_blazes", target: 150, requires: "nether", value: killed("blaze") },
  { id: "mine_quartz", target: 800, requires: "nether", value: mined("nether_quartz_ore") },
];
export const WEEKLY_REWARD = 100;
export const WEEKLY_REASON = "weekly_mission";
/** Quien ha jugado en estos días cuenta como «jugador activo» para desbloquear dimensiones. */
const ACTIVE_MS = 14 * 86_400_000;

export interface WeeklyStatus {
  week: string;
  mission: WeeklyMissionDef;
  total: number;
  contributions: Map<string, number>;
  completedAt: string | null;
}

export interface WeeklyCompletion {
  mission: WeeklyMissionDef;
  contributors: string[];
}

/** El lunes de la semana de `day` ("AAAA-MM-DD"). */
export function weekOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export class WeeklyMission {
  constructor(
    private readonly db: Database,
    private readonly timeZone: string,
    private readonly wallet: Wallet | null,
    private readonly rng: Rng = cryptoRng,
  ) {}

  /** Estado de la semana (la sortea si es nueva). */
  status(players: readonly PlayerRecord[], now = new Date()): WeeklyStatus {
    return this.db.transaction(() => this.statusOf(players, weekOf(dayIn(this.timeZone, now))));
  }

  /** Si con lo de ahora se cumple, paga a todos los que han aportado (una vez). */
  tick(players: readonly PlayerRecord[], now = new Date()): WeeklyCompletion | null {
    const day = dayIn(this.timeZone, now);
    return this.db.transaction(() => {
      const s = this.statusOf(players, weekOf(day));
      if (s.completedAt || s.total < s.mission.target) return null;
      this.db.run("UPDATE weekly_missions SET completed_at = ? WHERE week = ?", now.toISOString(), s.week);
      const contributors = [...s.contributions].filter(([, v]) => v > 0).map(([uuid]) => uuid);
      for (const uuid of contributors) this.wallet?.credit(uuid, WEEKLY_REWARD, WEEKLY_REASON, day);
      return { mission: s.mission, contributors };
    });
  }

  private statusOf(players: readonly PlayerRecord[], week: string): WeeklyStatus {
    let row = this.db.get<{ mission: string; completed_at: string | null }>("SELECT mission, completed_at FROM weekly_missions WHERE week = ?", week);
    if (!row) {
      const active = players.filter((p) => p.savedAt && Date.now() - p.savedAt.getTime() < ACTIVE_MS);
      const share = (realm: Dimension) => (active.length > 0 ? active.filter((p) => hasDimension(p, realm)).length / active.length : 0);
      const options = WEEKLY_MISSIONS.filter((m) => !m.requires || share(m.requires) >= 0.5);
      const mission = options[this.rng(options.length)] ?? WEEKLY_MISSIONS[0];
      if (!mission) throw new Error("Sin misiones semanales");
      this.db.run("INSERT INTO weekly_missions (week, mission) VALUES (?, ?)", week, mission.id);
      this.db.run("DELETE FROM weekly_mission_baselines WHERE week < ?", week);
      row = { mission: mission.id, completed_at: null };
    }
    const mission = WEEKLY_MISSIONS.find((m) => m.id === row.mission) ?? WEEKLY_MISSIONS[0];
    if (!mission) throw new Error("Sin misiones semanales");
    const contributions = new Map<string, number>();
    let total = 0;
    for (const p of players) {
      const current = mission.value(p);
      let base = this.db.get<{ value: number }>("SELECT value FROM weekly_mission_baselines WHERE week = ? AND uuid = ?", week, p.uuid)?.value;
      if (base === undefined || current < base) {
        this.db.run(
          "INSERT INTO weekly_mission_baselines (week, uuid, value) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET value = excluded.value",
          week,
          p.uuid,
          current,
        );
        base = current;
      }
      const delta = Math.max(0, current - base);
      if (delta > 0) contributions.set(p.uuid, delta);
      total += delta;
    }
    return { week, mission, total, contributions, completedAt: row.completed_at };
  }
}
