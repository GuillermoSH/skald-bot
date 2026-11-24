/**
 * «Primeros» del servidor: quién consiguió antes que nadie cada logro.
 *
 * - `reconcile()` lee los logros de los ficheros del mundo y apunta, sin avisar,
 *   los que aún no estaban (el histórico la primera vez; lo que pasó con el bot
 *   apagado, después). Debe ejecutarse antes de empezar a seguir el log.
 * - `claim()` se llama con cada logro del log en vivo: si nadie lo tenía, lo apunta
 *   y devuelve true (es el primero). Hasta que no se haya leído el histórico al
 *   menos una vez, nunca devuelve true (no hay forma de saberlo).
 *
 * Los logros se identifican por su clave de idioma (`advancementKey`), que sale
 * igual del id del fichero que del título del log.
 */
import { z } from "zod";
import { advancementKey } from "./lang.js";
import type { JsonStore } from "./state.js";
import type { PlayerRecord } from "./stats.js";

const claimSchema = z.object({
  /** Nombre del jugador (si vino del log) o null. */
  player: z.string().nullable(),
  /** UUID del jugador (si vino de los ficheros) o null. */
  uuid: z.string().nullable(),
  at: z.iso.datetime(),
  /** Se anunció en vivo (no es del histórico). */
  live: z.boolean(),
});

export const firstsSchema = z.object({
  version: z.literal(1),
  /** Ya se leyó el histórico de los ficheros al menos una vez. */
  seeded: z.boolean(),
  claims: z.record(z.string(), claimSchema),
});

export type FirstsState = z.infer<typeof firstsSchema>;
export type FirstClaim = z.infer<typeof claimSchema>;

export const emptyFirsts = (): FirstsState => ({ version: 1, seeded: false, claims: {} });

export class FirstsLedger {
  private constructor(
    private state: FirstsState,
    private readonly store: JsonStore<FirstsState> | null,
  ) {}

  /** Con `store` null, todo queda en memoria (para pruebas o sin STATE_DIR). */
  static async open(store: JsonStore<FirstsState> | null): Promise<FirstsLedger> {
    return new FirstsLedger(store ? await store.load() : emptyFirsts(), store);
  }

  get seeded(): boolean {
    return this.state.seeded;
  }

  get size(): number {
    return Object.keys(this.state.claims).length;
  }

  get(key: string): FirstClaim | undefined {
    return this.state.claims[key];
  }

  /** Apunta en silencio lo que haya en los ficheros y no estuviera. Devuelve cuántos nuevos. */
  async reconcile(players: readonly PlayerRecord[]): Promise<number> {
    const earliest = new Map<string, { uuid: string; at: Date }>();
    for (const player of players) {
      for (const adv of player.advancements) {
        if (!adv.doneAt) continue;
        const key = advancementKey(adv.id);
        const best = earliest.get(key);
        if (!best || adv.doneAt < best.at) earliest.set(key, { uuid: player.uuid, at: adv.doneAt });
      }
    }

    let added = 0;
    for (const [key, { uuid, at }] of earliest) {
      if (this.state.claims[key]) continue;
      this.state.claims[key] = { player: null, uuid, at: at.toISOString(), live: false };
      added++;
    }
    if (added > 0 || !this.state.seeded) {
      this.state.seeded = true;
      await this.store?.save(this.state);
    }
    return added;
  }

  /** Espera a que se guarde lo pendiente (cierre ordenado, pruebas). */
  flush(): Promise<void> {
    return this.store?.flush() ?? Promise.resolve();
  }

  /** ¿Es el primero del reino? Si lo es, queda apuntado. */
  claim(key: string, player: string, at: Date): boolean {
    if (!this.state.seeded || this.state.claims[key]) return false;
    this.state.claims[key] = { player, uuid: null, at: at.toISOString(), live: true };
    void this.store?.save(this.state);
    return true;
  }
}
