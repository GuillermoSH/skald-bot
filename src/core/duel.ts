/**
 * Duelo entre dos jugadores: compara categoría a categoría y lleva el marcador.
 * En algunas categorías gana quien menos tiene (morir no es ninguna hazaña).
 */
import { METRICS, type MetricId } from "./metrics.js";
import type { PlayerRecord } from "./stats.js";

export interface DuelCategory {
  id: MetricId;
  lowerWins?: boolean;
}

export const DUEL_CATEGORIES: readonly DuelCategory[] = [
  { id: "play_time" },
  { id: "mob_kills" },
  { id: "blocks_mined" },
  { id: "advancements" },
  { id: "distance" },
  { id: "diamonds" },
  { id: "logs" },
  { id: "fish" },
  { id: "trades" },
  { id: "breeding" },
  { id: "survivor" },
  { id: "deaths", lowerWins: true },
  { id: "silly_deaths", lowerWins: true },
];

export type Side = "a" | "b";

export interface DuelRound {
  id: MetricId;
  lowerWins: boolean;
  a: number;
  b: number;
  /** null = empate. */
  winner: Side | null;
}

export interface DuelResult {
  rounds: DuelRound[];
  score: Record<Side, number>;
  /** null = empate. */
  winner: Side | null;
}

export function duel(a: PlayerRecord, b: PlayerRecord, categories: readonly DuelCategory[] = DUEL_CATEGORIES): DuelResult {
  const score = { a: 0, b: 0 };
  const rounds = categories.map(({ id, lowerWins = false }): DuelRound => {
    const va = METRICS[id].value(a);
    const vb = METRICS[id].value(b);
    let winner: Side | null = null;
    if (va !== vb) winner = va > vb !== lowerWins ? "a" : "b";
    if (winner) score[winner]++;
    return { id, lowerWins, a: va, b: vb, winner };
  });
  const winner = score.a === score.b ? null : score.a > score.b ? "a" : "b";
  return { rounds, score, winner };
}
