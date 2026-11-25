/**
 * Fechas y horas escritas a mano, en la zona horaria del reino:
 *
 * - Relativas: "30m", "2h", "1d", "1h 30m", "90 min", "2 horas", "en 3 días".
 * - Absolutas: "18:00", "mañana 18:00", "24/12 21:30", "24/12/2026 21:30".
 *   Sin fecha, si la hora ya pasó hoy, es mañana. Sin año, si la fecha ya pasó, es el año que viene.
 *
 * Sin dependencias: la conversión de zona horaria va con Intl.
 */

const UNIT_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };

function unitOf(word: string): string | null {
  if (/^(m|min|mins|minutos?)$/.test(word)) return "m";
  if (/^(h|hr|hrs|horas?)$/.test(word)) return "h";
  if (/^(d|días?|dias?)$/.test(word)) return "d";
  return null;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** La fecha y hora de `at` tal como se ve en `timeZone`. */
export function localParts(at: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

function offsetMs(at: Date, timeZone: string): number {
  const p = localParts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(at.getTime() / 60_000) * 60_000;
}

/** Hora local de `timeZone` → instante. null si la fecha no existe (31/02, 25:00...). */
export function zonedToUtc(p: LocalParts, timeZone: string): Date | null {
  if (p.month < 1 || p.month > 12 || p.day < 1 || p.day > 31 || p.hour > 23 || p.minute > 59) return null;
  const guess = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  let t = guess - offsetMs(new Date(guess), timeZone);
  t = guess - offsetMs(new Date(t), timeZone); // segunda pasada por los cambios de hora
  const at = new Date(t);
  const back = localParts(at, timeZone);
  return back.day === p.day && back.month === p.month ? at : null;
}

const ABSOLUTE_RE = /^(?:(mañana|manana|hoy)\s+)?(?:(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\s+)?(?:a las\s+)?(\d{1,2})(?:[:.h](\d{2}))?$/;

/** Interpreta lo que ha escrito alguien; null si no se entiende. */
export function parseWhen(input: string, now: Date, timeZone: string): Date | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ").replace(/^en /, "");
  if (!text) return null;

  // Relativa: pares número + unidad.
  const tokens = [...text.matchAll(/(\d+)\s*([a-zíá]+)/g)];
  if (tokens.length > 0 && tokens.map((m) => m[0]).join(" ").replace(/\s+/g, "") === text.replace(/\s+/g, "")) {
    let ms = 0;
    for (const [, n, word] of tokens) {
      const unit = unitOf(word ?? "");
      if (!unit) return null;
      ms += Number(n) * (UNIT_MS[unit] ?? 0);
    }
    return ms > 0 ? new Date(now.getTime() + ms) : null;
  }

  const m = ABSOLUTE_RE.exec(text);
  if (!m) return null;
  const [, dayWord, dd, mm, yy, hh, mi] = m;
  // "18" a secas solo vale con algo más ("mañana 18"); un número suelto es ambiguo.
  if (mi === undefined && !dayWord && !dd) return null;
  const today = localParts(now, timeZone);
  const hour = Number(hh);
  const minute = Number(mi ?? 0);

  if (dd && mm) {
    const day = Number(dd);
    const month = Number(mm);
    let year = yy ? (yy.length === 2 ? 2000 + Number(yy) : Number(yy)) : today.year;
    let at = zonedToUtc({ year, month, day, hour, minute }, timeZone);
    if (at && !yy && at <= now) {
      year++;
      at = zonedToUtc({ year, month, day, hour, minute }, timeZone);
    }
    return at;
  }

  const base = { year: today.year, month: today.month, day: today.day, hour, minute };
  let at = zonedToUtc(base, timeZone);
  if (!at) return null;
  const tomorrow = dayWord === "mañana" || dayWord === "manana";
  if (tomorrow || (!dayWord && at <= now)) {
    // Mañana a esa hora (sumando un día a la fecha local, no 24 h: cambios de hora).
    const next = new Date(Date.UTC(base.year, base.month - 1, base.day + 1));
    at = zonedToUtc({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour, minute }, timeZone);
  }
  return at;
}
