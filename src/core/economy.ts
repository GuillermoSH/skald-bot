/**
 * Economía (base): monedas que se ganan solas jugando, calculadas por diferencia
 * entre lo que dicen ahora las estadísticas del mundo y lo ya contado.
 *
 * - Las monedas son de la persona (UUID de Minecraft), no de la temporada: el
 *   saldo suma todo el libro. Cada movimiento guarda su temporada de origen.
 * - El libro (`ledger`) solo crece: nunca se edita ni se borra un movimiento.
 * - La primera vez que se ve a un jugador en una temporada solo se apunta la línea
 *   base: lo jugado antes no se paga (el regalo inicial, si llega, irá aparte).
 * - Tope diario por categoría (día según `timeZone`). Lo que pasa del tope se pierde
 *   (no se acumula para mañana); lo que no llega a una moneda, sí se guarda.
 * - Contra el AFK: el tiempo jugado solo cuenta si en el mismo intervalo hubo otra
 *   actividad (enemigos, bloques o distancia).
 */
import type { Database } from "./db.js";
import { METRICS } from "./metrics.js";
import type { PlayerRecord } from "./stats.js";

export const EARN_CATEGORIES = ["play_time", "mob_kills", "blocks_mined", "distance"] as const;
export type EarnCategory = (typeof EARN_CATEGORIES)[number];

export interface EarnRule {
  value(p: PlayerRecord): number;
  /** Cuánto de la estadística vale una moneda. */
  per: number;
  /** Monedas máximas al día. */
  dailyCap: number;
}

export const EARN_RULES: Readonly<Record<EarnCategory, EarnRule>> = {
  // 1 moneda cada 10 min de juego activo (12 000 ticks); hasta 60 al día (10 h).
  play_time: { value: (p) => METRICS.play_time.value(p), per: 12_000, dailyCap: 60 },
  // 1 cada 5 enemigos; hasta 40.
  mob_kills: { value: (p) => METRICS.mob_kills.value(p), per: 5, dailyCap: 40 },
  // 1 cada 50 bloques picados; hasta 40.
  blocks_mined: { value: (p) => METRICS.blocks_mined.value(p), per: 50, dailyCap: 40 },
  // 1 por km recorrido (100 000 cm); hasta 30.
  distance: { value: (p) => METRICS.distance.value(p), per: 100_000, dailyCap: 30 },
};

/**
 * Regalo inicial: un pago único por lo jugado antes de que la economía empezara a
 * contar (el «origen» de cada jugador en la temporada). Tasa más baja que la del
 * día a día, porque ese tiempo incluye AFK y no se puede filtrar, y con tope total.
 */
export const GIFT_RULES: Readonly<Record<EarnCategory, { per: number }>> = {
  play_time: { per: 36_000 }, // 1 cada 30 min
  mob_kills: { per: 10 },
  blocks_mined: { per: 100 },
  distance: { per: 200_000 }, // 1 cada 2 km
};
export const GIFT_CAP = 500;
export const GIFT_REASON = "initial";

export interface Gift {
  uuid: string;
  byCategory: Record<EarnCategory, number>;
  /** Con el tope aplicado. */
  total: number;
  capped: boolean;
}

export function computeGift(uuid: string, origin: Partial<Record<EarnCategory, number>>): Gift {
  const byCategory = Object.fromEntries(
    EARN_CATEGORIES.map((c) => [c, Math.floor(Math.max(0, origin[c] ?? 0) / GIFT_RULES[c].per)]),
  ) as Record<EarnCategory, number>;
  const raw = EARN_CATEGORIES.reduce((sum, c) => sum + byCategory[c], 0);
  return { uuid, byCategory, total: Math.min(raw, GIFT_CAP), capped: raw > GIFT_CAP };
}

export interface Earning {
  uuid: string;
  category: EarnCategory | typeof GIFT_REASON;
  amount: number;
}

/** "2026-11-25" en la zona horaria dada. */
export function dayIn(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export class Economy {
  constructor(
    private readonly db: Database,
    readonly seasonId: number,
    private readonly timeZone: string,
    private readonly rules: Readonly<Record<EarnCategory, EarnRule>> = EARN_RULES,
  ) {}

  /** Paga lo ganado desde la última vez. Devuelve los movimientos nuevos. */
  tick(players: readonly PlayerRecord[], now = new Date()): Earning[] {
    const day = dayIn(this.timeZone, now);
    const at = now.toISOString();
    return this.db.transaction(() => {
      const earnings: Earning[] = [];
      for (const player of players) {
        const base = new Map(
          this.db
            .all<{ metric: string; value: number }>(
              "SELECT metric, value FROM stat_baselines WHERE season_id = ? AND uuid = ?",
              this.seasonId,
              player.uuid,
            )
            .map((r) => [r.metric, r.value]),
        );
        const current = new Map(EARN_CATEGORIES.map((c) => [c, this.rules[c].value(player)] as const));

        // Primera vez en esta temporada: solo la línea base (y su origen, para el regalo).
        if (base.size === 0) {
          for (const [c, v] of current) {
            this.setBaseline(player.uuid, c, v);
            this.db.run(
              "INSERT OR IGNORE INTO stat_origins (season_id, uuid, metric, value) VALUES (?, ?, ?, ?)",
              this.seasonId,
              player.uuid,
              c,
              v,
            );
          }
          // Si el regalo ya se repartió, quien aparece ahora también lo recibe.
          if (this.giftApplied) {
            const gift = this.payGift(player.uuid, day, at);
            if (gift) earnings.push({ uuid: player.uuid, category: GIFT_REASON, amount: gift });
          }
          continue;
        }

        const delta = (c: EarnCategory) => (current.get(c) ?? 0) - (base.get(c) ?? current.get(c) ?? 0);
        const active = EARN_CATEGORIES.some((c) => c !== "play_time" && delta(c) > 0);

        for (const c of EARN_CATEGORIES) {
          const value = current.get(c) ?? 0;
          const d = delta(c);
          // Estadísticas que bajan (mundo reiniciado, fichero cambiado): se vuelve a empezar.
          // Tiempo sin actividad: no cuenta.
          if (d <= 0 || (c === "play_time" && !active)) {
            if (d !== 0) this.setBaseline(player.uuid, c, value);
            continue;
          }
          const rule = this.rules[c];
          const coins = Math.floor(d / rule.per);
          const room = Math.max(0, rule.dailyCap - this.earnedOn(player.uuid, c, day));
          const paid = Math.min(coins, room);
          if (paid > 0) {
            this.db.run(
              "INSERT INTO ledger (uuid, amount, reason, season_id, day, at) VALUES (?, ?, ?, ?, ?, ?)",
              player.uuid,
              paid,
              c,
              this.seasonId,
              day,
              at,
            );
            earnings.push({ uuid: player.uuid, category: c, amount: paid });
          }
          // Con tope: lo que sobra se pierde. Sin tope: lo que no llega a una moneda se guarda.
          if (coins > paid) this.setBaseline(player.uuid, c, value);
          else if (paid > 0) this.setBaseline(player.uuid, c, (base.get(c) ?? value) + paid * rule.per);
        }
      }
      return earnings;
    });
  }

  /** El regalo de esta temporada ya se repartió (los que lleguen después, lo reciben al aparecer). */
  get giftApplied(): boolean {
    return this.db.getMeta(`gift_applied:${this.seasonId}`) !== null;
  }

  /** Lo que tocaría a cada uno (sin pagar nada), de más a menos. */
  giftPreview(): Gift[] {
    const rows = this.db.all<{ uuid: string; metric: string; value: number }>(
      "SELECT uuid, metric, value FROM stat_origins WHERE season_id = ?",
      this.seasonId,
    );
    const origins = new Map<string, Partial<Record<EarnCategory, number>>>();
    for (const r of rows) {
      const o = origins.get(r.uuid) ?? {};
      if ((EARN_CATEGORIES as readonly string[]).includes(r.metric)) o[r.metric as EarnCategory] = r.value;
      origins.set(r.uuid, o);
    }
    return [...origins].map(([uuid, o]) => computeGift(uuid, o)).sort((a, b) => b.total - a.total);
  }

  /** Reparte el regalo (una sola vez por persona). Devuelve lo pagado. */
  applyGift(now = new Date()): { players: number; coins: number } {
    const day = dayIn(this.timeZone, now);
    const at = now.toISOString();
    return this.db.transaction(() => {
      let players = 0;
      let coins = 0;
      for (const { uuid } of this.giftPreview()) {
        const paid = this.payGift(uuid, day, at);
        if (paid) {
          players++;
          coins += paid;
        }
      }
      this.db.setMeta(`gift_applied:${this.seasonId}`, at);
      return { players, coins };
    });
  }

  private payGift(uuid: string, day: string, at: string): number {
    if (this.db.get("SELECT 1 AS x FROM ledger WHERE uuid = ? AND reason = ?", uuid, GIFT_REASON)) return 0;
    const origin = Object.fromEntries(
      this.db
        .all<{ metric: string; value: number }>("SELECT metric, value FROM stat_origins WHERE season_id = ? AND uuid = ?", this.seasonId, uuid)
        .map((r) => [r.metric, r.value]),
    ) as Partial<Record<EarnCategory, number>>;
    const gift = computeGift(uuid, origin);
    if (gift.total <= 0) return 0;
    this.db.run(
      "INSERT INTO ledger (uuid, amount, reason, season_id, day, at) VALUES (?, ?, ?, ?, ?, ?)",
      uuid,
      gift.total,
      GIFT_REASON,
      this.seasonId,
      day,
      at,
    );
    return gift.total;
  }

  balance(uuid: string): number {
    return this.db.get<{ n: number | null }>("SELECT SUM(amount) AS n FROM ledger WHERE uuid = ?", uuid)?.n ?? 0;
  }

  earnedToday(uuid: string, now = new Date()): Record<EarnCategory, number> {
    const day = dayIn(this.timeZone, now);
    const out = Object.fromEntries(EARN_CATEGORIES.map((c) => [c, 0])) as Record<EarnCategory, number>;
    for (const c of EARN_CATEGORIES) out[c] = this.earnedOn(uuid, c, day);
    return out;
  }

  /** Los más ricos (saldo total, de todas las temporadas). */
  top(limit = 10): { uuid: string; balance: number }[] {
    return this.db.all<{ uuid: string; balance: number }>(
      "SELECT uuid, SUM(amount) AS balance FROM ledger GROUP BY uuid HAVING balance > 0 ORDER BY balance DESC LIMIT ?",
      limit,
    );
  }

  private earnedOn(uuid: string, category: string, day: string): number {
    return (
      this.db.get<{ n: number | null }>(
        "SELECT SUM(amount) AS n FROM ledger WHERE uuid = ? AND reason = ? AND day = ? AND amount > 0",
        uuid,
        category,
        day,
      )?.n ?? 0
    );
  }

  private setBaseline(uuid: string, metric: string, value: number): void {
    this.db.run(
      "INSERT INTO stat_baselines (season_id, uuid, metric, value) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET value = excluded.value",
      this.seasonId,
      uuid,
      metric,
      value,
    );
  }
}
