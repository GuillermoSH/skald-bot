/**
 * Acciones de administración que el servidor deja en el log (verificado en 26.2):
 * - Hechas por un jugador: `[Ragnar: Set own game mode to Creative Mode]`.
 * - Desde la consola: el mensaje tal cual, sin corchetes.
 * - Por RCON: `[Rcon: …]` (p. ej. `docker exec minecraft rcon-cli op …`). Lo que manda Skald
 *   por RCON (tellraw, playsound, gamerules del arranque) no encaja en estas plantillas.
 * Los textos salen de las plantillas `commands.*` de en_us (del jar); si no hay jar,
 * de las de 26.2 que van aquí.
 */
export const AUDIT_ACTIONS = [
  "gamemode_self",
  "gamemode_other",
  "op",
  "deop",
  "ban",
  "pardon",
  "kick",
  "whitelist_add",
  "whitelist_remove",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

type Slot = "target" | "mode" | "reason";

const TEMPLATES: Record<AuditAction, { key: string; fallback: string; slots: Slot[] }> = {
  gamemode_self: { key: "commands.gamemode.success.self", fallback: "Set own game mode to %s", slots: ["mode"] },
  gamemode_other: { key: "commands.gamemode.success.other", fallback: "Set %s's game mode to %s", slots: ["target", "mode"] },
  op: { key: "commands.op.success", fallback: "Made %s a server operator", slots: ["target"] },
  deop: { key: "commands.deop.success", fallback: "Made %s no longer a server operator", slots: ["target"] },
  ban: { key: "commands.ban.success", fallback: "Banned %s: %s", slots: ["target", "reason"] },
  pardon: { key: "commands.pardon.success", fallback: "Unbanned %s", slots: ["target"] },
  kick: { key: "commands.kick.success", fallback: "Kicked %s: %s", slots: ["target", "reason"] },
  whitelist_add: { key: "commands.whitelist.add.success", fallback: "Added %s to the whitelist", slots: ["target"] },
  whitelist_remove: { key: "commands.whitelist.remove.success", fallback: "Removed %s from the whitelist", slots: ["target"] },
};

const NAME = "[A-Za-z0-9_]{3,16}";
const SLOT_RE: Record<Slot, string> = { target: `(${NAME})`, mode: "(.+?)", reason: "(.*)" };

export interface AuditMatch {
  action: AuditAction;
  /** Quién lo hizo (null = la consola o RCON, ver `via`). */
  actor: string | null;
  via: "player" | "console" | "rcon";
  target: string | null;
  /** Modo de juego en inglés, tal como sale en el log ("Creative Mode"). */
  mode: string | null;
  reason: string | null;
}

const ACTOR_RE = new RegExp(`^\\[(${NAME}|Server|Rcon): (.+)\\]$`);

export class AuditParser {
  private readonly patterns: { action: AuditAction; regex: RegExp; slots: Slot[] }[];

  /** `english(key)` da la plantilla en inglés del jar (o undefined). */
  constructor(english: (key: string) => string | undefined = () => undefined) {
    this.patterns = AUDIT_ACTIONS.map((action) => {
      const t = TEMPLATES[action];
      const template = english(t.key) ?? t.fallback;
      const parts = template.split(/%(?:\d+\$)?s/);
      let source = "^";
      parts.forEach((literal, i) => {
        source += literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const slot = t.slots[i];
        if (i < parts.length - 1 && slot) source += SLOT_RE[slot];
      });
      return { action, regex: new RegExp(`${source}$`), slots: t.slots };
    });
  }

  /** Una línea del log (el mensaje, sin hora ni hilo) → acción, o null. */
  parse(message: string): AuditMatch | null {
    let actor: string | null = null;
    let via: AuditMatch["via"] = "console";
    let inner = message;
    const wrapped = ACTOR_RE.exec(message);
    if (wrapped) {
      if (wrapped[1] === "Rcon") via = "rcon";
      else if (wrapped[1] !== "Server") {
        actor = wrapped[1] ?? null;
        via = "player";
      }
      inner = wrapped[2] ?? "";
    }
    for (const p of this.patterns) {
      const m = p.regex.exec(inner);
      if (!m) continue;
      const get = (slot: Slot) => {
        const i = p.slots.indexOf(slot);
        return i === -1 ? null : (m[i + 1] ?? null);
      };
      const target = p.action === "gamemode_self" ? actor : get("target");
      return { action: p.action, actor, via, target, mode: get("mode"), reason: get("reason") };
    }
    return null;
  }
}
