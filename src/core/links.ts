/**
 * Vinculaciones Discord ↔ Minecraft. La identidad es el UUID; el nombre se
 * refresca. Una cuenta de Discord, una de Minecraft (y al revés).
 *
 * Estados: `pending` (vinculado, aún no ha entrado al servidor), `active` (ha
 * entrado: Einherjar), y más adelante `inactive` / `exiled` (fases 3 y 4).
 */
import type { Database } from "./db.js";

export type LinkStatus = "pending" | "active" | "inactive" | "exiled";

export interface Link {
  discordId: string;
  uuid: string;
  mcName: string;
  status: LinkStatus;
  linkedAt: string;
  linkedBy: string | null;
  activatedAt: string | null;
  lastSeen: string | null;
}

interface LinkRow {
  discord_id: string;
  uuid: string;
  mc_name: string;
  status: string;
  linked_at: string;
  linked_by: string | null;
  activated_at: string | null;
  last_seen: string | null;
}

const STATUSES: readonly LinkStatus[] = ["pending", "active", "inactive", "exiled"];

const toLink = (r: LinkRow): Link => ({
  discordId: r.discord_id,
  uuid: r.uuid,
  mcName: r.mc_name,
  status: (STATUSES as readonly string[]).includes(r.status) ? (r.status as LinkStatus) : "pending",
  linkedAt: r.linked_at,
  linkedBy: r.linked_by,
  activatedAt: r.activated_at,
  lastSeen: r.last_seen,
});

export type LinkConflict = "discord_taken" | "uuid_taken";

export class Links {
  constructor(private readonly db: Database) {}

  byDiscord(discordId: string): Link | null {
    const r = this.db.get<LinkRow>("SELECT * FROM links WHERE discord_id = ?", discordId);
    return r ? toLink(r) : null;
  }

  byUuid(uuid: string): Link | null {
    const r = this.db.get<LinkRow>("SELECT * FROM links WHERE uuid = ?", uuid.toLowerCase());
    return r ? toLink(r) : null;
  }

  /** ¿Por qué no se puede vincular? null si se puede. */
  conflict(discordId: string, uuid: string): LinkConflict | null {
    if (this.byDiscord(discordId)) return "discord_taken";
    if (this.byUuid(uuid)) return "uuid_taken";
    return null;
  }

  /** Crea la vinculación (lanza si choca con otra: comprobar antes con `conflict`). */
  create(discordId: string, uuid: string, mcName: string, linkedBy: string | null, now = new Date()): Link {
    this.db.run(
      "INSERT INTO links (discord_id, uuid, mc_name, status, linked_at, linked_by) VALUES (?, ?, ?, 'pending', ?, ?)",
      discordId,
      uuid.toLowerCase(),
      mcName,
      now.toISOString(),
      linkedBy,
    );
    const link = this.byDiscord(discordId);
    if (!link) throw new Error("No se pudo guardar la vinculación");
    return link;
  }

  activate(discordId: string, now = new Date()): void {
    this.db.run(
      "UPDATE links SET status = 'active', activated_at = COALESCE(activated_at, ?), last_seen = ? WHERE discord_id = ?",
      now.toISOString(),
      now.toISOString(),
      discordId,
    );
  }

  /** Ha entrado al servidor: refresca nombre y última conexión. */
  seen(uuid: string, mcName: string, now = new Date()): void {
    this.db.run("UPDATE links SET mc_name = ?, last_seen = ? WHERE uuid = ?", mcName, now.toISOString(), uuid.toLowerCase());
  }

  /** Los que ahora son Einherjar. */
  active(): Link[] {
    return this.db.all<LinkRow>("SELECT * FROM links WHERE status = 'active'").map(toLink);
  }

  /** La última conexión más reciente de todos (para saber si el servidor está en uso). */
  latestSeen(): Date | null {
    const r = this.db.get<{ at: string | null }>("SELECT MAX(last_seen) AS at FROM links");
    return r?.at ? new Date(r.at) : null;
  }

  deactivate(discordId: string): void {
    this.db.run("UPDATE links SET status = 'inactive' WHERE discord_id = ? AND status = 'active'", discordId);
  }

  remove(discordId: string): Link | null {
    const link = this.byDiscord(discordId);
    if (link) this.db.run("DELETE FROM links WHERE discord_id = ?", discordId);
    return link;
  }
}
