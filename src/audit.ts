/**
 * Auditoría mínima en el canal de administración:
 * - Del juego (desde el log): modo de juego, op/deop, ban/unban, kick y lista blanca,
 *   también desde la consola o RCON. Nunca los baneos de IP (no se enseñan IPs).
 * - De Discord: cambios de roles de un miembro, salvo los automáticos de Skald (rol de
 *   entrada y de jugador) y los gestionados por Discord (boost, bots). Si Skald tiene
 *   «Ver registro de auditoría», dice quién lo hizo.
 * Lo que llega seguido se agrupa en un solo mensaje.
 */
import { AuditLogEvent, Events, PermissionFlagsBits, type Client, type GuildMember, type PartialGuildMember, type Role } from "discord.js";
import type { Config } from "./config.js";
import type { AuditMatch } from "./core/audit.js";
import type { Translator } from "./core/lang.js";
import { safeText } from "./util/escape.js";
import { log } from "./util/log.js";
import { texts } from "./util/texts.js";

const t = texts.audit;
const BATCH_MS = 5_000;
const MAX_LINES = 15;

export type AuditSend = (title: string, lines: string[]) => Promise<void>;

export function describeAudit(a: AuditMatch, lang: Pick<Translator, "gameModeName">): string {
  const actor = a.actor ? `**${safeText(a.actor, 16)}**` : a.via === "rcon" ? t.rcon : t.console;
  const target = a.target ? `**${safeText(a.target, 16)}**` : actor;
  const reason = safeText(a.reason ?? "", 120);
  const mode = safeText(lang.gameModeName(a.mode ?? ""), 40);
  switch (a.action) {
    case "gamemode_self":
      return t.gamemode_self(actor, mode);
    case "gamemode_other":
      return t.gamemode_other(actor, target, mode);
    case "ban":
    case "kick":
      return t[a.action](actor, target, reason);
    default:
      return t[a.action](actor, target);
  }
}

/** Agrupa las líneas que llegan seguidas y las manda juntas. */
export class AuditFeed {
  private pending: string[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly send: AuditSend) {}

  push(line: string): void {
    this.pending.push(line);
    this.timer ??= setTimeout(() => void this.flush(), BATCH_MS);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private async flush(): Promise<void> {
    this.timer = null;
    const lines = this.pending.splice(0);
    if (lines.length === 0) return;
    const shown = lines.slice(-MAX_LINES);
    if (lines.length > MAX_LINES) shown.unshift(`-# …y ${lines.length - MAX_LINES} más antes.`);
    await this.send(t.title, shown).catch((error: unknown) => {
      log.warn(`No se pudo enviar el registro: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}

/** Roles que cambian entre antes y después, sin los automáticos ni los gestionados. */
export function roleChanges(
  before: readonly Role[],
  after: readonly Role[],
  ignored: ReadonlySet<string>,
): { added: Role[]; removed: Role[] } {
  const keep = (r: Role) => !r.managed && !ignored.has(r.id) && r.id !== r.guild.id;
  const had = new Set(before.map((r) => r.id));
  const has = new Set(after.map((r) => r.id));
  return {
    added: after.filter((r) => keep(r) && !had.has(r.id)),
    removed: before.filter((r) => keep(r) && !has.has(r.id)),
  };
}

export function watchDiscordRoles(client: Client<true>, config: Config, feed: AuditFeed): void {
  const ignored = new Set([config.AUTO_ROLE_ID, config.PLAYER_ROLE_ID].filter((id): id is string => id !== undefined));
  client.on(Events.GuildMemberUpdate, (before: GuildMember | PartialGuildMember, after: GuildMember) => {
    if (after.guild.id !== config.DISCORD_GUILD_ID || before.partial) return;
    const { added, removed } = roleChanges([...before.roles.cache.values()], [...after.roles.cache.values()], ignored);
    if (added.length === 0 && removed.length === 0) return;
    void describeExecutor(after).then((by) => {
      const member = `**${safeText(after.displayName, 32)}**`;
      const names = (roles: Role[]) => roles.map((r) => `**${safeText(r.name, 40)}**`).join(", ");
      if (added.length > 0) feed.push(`${t.rolesAdded(member, names(added))}${by}`);
      if (removed.length > 0) feed.push(`${t.rolesRemoved(member, names(removed))}${by}`);
    });
  });
}

/** «(por Fulano)» si Skald puede leer el registro de auditoría de Discord; "" si no o si fue Skald. */
async function describeExecutor(member: GuildMember): Promise<string> {
  const me = member.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return "";
  try {
    const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 5 });
    const entry = logs.entries.find((e) => e.targetId === member.id && Date.now() - e.createdTimestamp < 15_000);
    const executor = entry?.executor;
    if (!executor || executor.id === member.client.user.id) return "";
    return t.by(`**${safeText(executor.username ?? executor.id, 32)}**`);
  } catch {
    return "";
  }
}
