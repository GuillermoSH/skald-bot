/**
 * La ruleta (la rueda de las nornas): se paga con monedas y da un premio al azar de
 * las tablas de botín. Hay que estar unido al reino y conectado al juego (los objetos
 * se entregan al momento con `give`). Se cobra antes de tirar; si el objeto no se puede
 * entregar, se devuelve. El resultado lo ve solo quien tira; cada entrega queda en el
 * registro de administración.
 */
import type { CommandContext } from "./commands/types.js";
import { dayIn } from "./core/economy.js";
import { cryptoRng, rollPrize, type Prize, type Rng } from "./core/loot.js";
import { log } from "./util/log.js";

export const SPIN_COST = 100;
export const MAX_SPINS_PER_DAY = 5;
export const SPIN_REASON = "roulette";
const REFUND_REASON = "roulette_refund";

export type SpinFailure = "economy_off" | "offline" | "poor" | "limit" | "busy" | "give_failed";
export type SpinResult =
  | { ok: true; prize: Prize; balance: number; spinsLeft: number }
  | { ok: false; reason: SpinFailure; balance?: number };

export class Roulette {
  private readonly spinning = new Set<string>();

  constructor(
    private readonly ctx: CommandContext,
    /** Registro de lo entregado (canal de administración). */
    private readonly record: (player: string, prize: Prize) => void = () => undefined,
    private readonly rng: Rng = cryptoRng,
  ) {}

  /** Tiradas que le quedan hoy (null si la economía está apagada). */
  spinsLeft(uuid: string): number | null {
    const economy = this.ctx.realm.economy;
    if (!economy) return null;
    return Math.max(0, MAX_SPINS_PER_DAY - economy.spentCountOn(uuid, SPIN_REASON, dayIn(economy.timeZoneName, new Date())));
  }

  /** `uuid` y `player` (nombre en el juego) de alguien ya comprobado como unido al reino. */
  async spin(uuid: string, player: string): Promise<SpinResult> {
    const economy = this.ctx.realm.tasks ? this.ctx.realm.economy : null; // en pausa de era, no
    if (!economy) return { ok: false, reason: "economy_off" };
    if (this.spinning.has(uuid)) return { ok: false, reason: "busy" };
    this.spinning.add(uuid);
    try {
      const online = await this.ctx.rcon
        .listPlayers()
        .then((l) => l.names.some((n) => n.toLowerCase() === player.toLowerCase()))
        .catch(() => false);
      if (!online) return { ok: false, reason: "offline" };
      const day = dayIn(economy.timeZoneName, new Date());
      const balance = economy.balance(uuid);
      if (balance < SPIN_COST) return { ok: false, reason: "poor", balance };
      if (economy.spentCountOn(uuid, SPIN_REASON, day) >= MAX_SPINS_PER_DAY) return { ok: false, reason: "limit", balance };

      economy.debit(uuid, SPIN_COST, SPIN_REASON, day);
      const prize = rollPrize(this.rng);
      if (prize.kind === "coins") economy.credit(uuid, prize.coins, `${SPIN_REASON}:${prize.group}`, day);
      if (prize.kind === "item" || prize.kind === "book") {
        const [item, count, enchantments] =
          prize.kind === "item" ? [prize.id, prize.count, []] : (["minecraft:enchanted_book", 1, prize.enchantments] as const);
        const response = await this.ctx.rcon.give(player, item, count, enchantments).catch((error: unknown) => {
          log.warn(`Ruleta: no se pudo entregar a ${player}: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        });
        if (response === null || /no player was found/i.test(response)) {
          economy.credit(uuid, SPIN_COST, REFUND_REASON, day);
          return { ok: false, reason: "give_failed", balance: economy.balance(uuid) };
        }
        this.record(player, prize);
      }
      log.info(`Ruleta: ${player} → ${prize.kind === "item" ? `${prize.count}× ${prize.id}` : prize.kind}`);
      return {
        ok: true,
        prize,
        balance: economy.balance(uuid),
        spinsLeft: Math.max(0, MAX_SPINS_PER_DAY - economy.spentCountOn(uuid, SPIN_REASON, day)),
      };
    } finally {
      this.spinning.delete(uuid);
    }
  }
}
