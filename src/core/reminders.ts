/**
 * Recordatorios guardados en la base de datos (sobreviven a los reinicios: al
 * arrancar, los que vencieron con Skald apagado salen con retraso).
 *
 * - `user`: a quien lo pidió (por privado; si no se puede, en el canal donde lo pidió).
 * - `channel`: en el canal donde se pidió.
 * - `event`: aviso previo de una quedada (evento de Discord) a sus interesados.
 */
import type { Database } from "./db.js";

export type ReminderKind = "user" | "channel" | "event";

export interface Reminder {
  id: number;
  kind: ReminderKind;
  guildId: string;
  channelId: string;
  userId: string;
  text: string;
  dueAt: Date;
  createdAt: Date;
  eventId: string | null;
}

interface ReminderRow {
  id: number;
  kind: string;
  guild_id: string;
  channel_id: string;
  user_id: string;
  text: string;
  due_at: string;
  created_at: string;
  event_id: string | null;
}

const toReminder = (r: ReminderRow): Reminder => ({
  id: r.id,
  kind: r.kind === "channel" || r.kind === "event" ? r.kind : "user",
  guildId: r.guild_id,
  channelId: r.channel_id,
  userId: r.user_id,
  text: r.text,
  dueAt: new Date(r.due_at),
  createdAt: new Date(r.created_at),
  eventId: r.event_id,
});

/** Pendientes como máximo por persona (para que nadie llene la base de datos). */
export const MAX_PENDING_PER_USER = 25;

export class Reminders {
  constructor(private readonly db: Database) {}

  add(r: Omit<Reminder, "id" | "createdAt">, now = new Date()): number {
    return this.db.run(
      "INSERT INTO reminders (kind, guild_id, channel_id, user_id, text, due_at, created_at, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      r.kind,
      r.guildId,
      r.channelId,
      r.userId,
      r.text,
      r.dueAt.toISOString(),
      now.toISOString(),
      r.eventId,
    ).lastId;
  }

  /** Vencidos y sin enviar, del más antiguo al más nuevo. */
  due(now = new Date(), limit = 20): Reminder[] {
    return this.db
      .all<ReminderRow>("SELECT * FROM reminders WHERE sent_at IS NULL AND due_at <= ? ORDER BY due_at LIMIT ?", now.toISOString(), limit)
      .map(toReminder);
  }

  /** Pendientes de una persona (los de quedadas no, que son de Skald). */
  pendingFor(userId: string): Reminder[] {
    return this.db
      .all<ReminderRow>(
        "SELECT * FROM reminders WHERE sent_at IS NULL AND user_id = ? AND kind != 'event' ORDER BY due_at",
        userId,
      )
      .map(toReminder);
  }

  /** Marca como hecho (enviado o imposible de enviar, con el motivo). */
  done(id: number, error: string | null = null, now = new Date()): void {
    this.db.run("UPDATE reminders SET sent_at = ?, error = ? WHERE id = ?", now.toISOString(), error, id);
  }

  /** Borra uno pendiente de esa persona. */
  cancel(id: number, userId: string): boolean {
    return this.db.run("DELETE FROM reminders WHERE id = ? AND user_id = ? AND sent_at IS NULL AND kind != 'event'", id, userId).changes === 1;
  }
}
