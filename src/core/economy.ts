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

export interface Earning {
  uuid: string;
  category: EarnCategory;
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

        // Primera vez en esta temporada: solo la línea base.
        if (base.size === 0) {
          for (const [c, v] of current) this.setBaseline(player.uuid, c, v);
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
