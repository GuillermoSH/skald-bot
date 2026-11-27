/**
 * Vigilancia del lag: decide cuándo avisar con muestras periódicas de `tick query`.
 * Solo avisa de cambios de estado y con margen (varias muestras seguidas), para no
 * saltar por un pico suelto (un autoguardado, alguien generando chunks).
 */
export interface LagSample {
  tps: number;
  mspt: number;
}

export type LagChange = { kind: "lag"; sample: LagSample } | { kind: "recovered"; sample: LagSample; minutes: number };

export interface LagOptions {
  /** Por debajo de esto hay lag. */
  minTps: number;
  /** Muestras seguidas con lag antes de avisar. */
  confirm: number;
  /** Muestras seguidas bien antes de dar por recuperado. */
  recover: number;
}

export const LAG_DEFAULTS: LagOptions = { minTps: 15, confirm: 3, recover: 3 };

export class LagMonitor {
  private lagging = false;
  private streak = 0;
  private since = 0;

  constructor(private readonly options: LagOptions = LAG_DEFAULTS) {}

  get isLagging(): boolean {
    return this.lagging;
  }

  /** `null` = no hay datos (servidor caído o pausado): no cuenta ni a favor ni en contra. */
  update(sample: LagSample | null, now = Date.now()): LagChange | null {
    if (!sample) return null;
    const bad = sample.tps < this.options.minTps;
    if (bad === this.lagging) {
      this.streak = 0;
      return null;
    }
    this.streak++;
    if (this.streak < (this.lagging ? this.options.recover : this.options.confirm)) return null;
    this.streak = 0;
    this.lagging = bad;
    if (bad) {
      this.since = now;
      return { kind: "lag", sample };
    }
    return { kind: "recovered", sample, minutes: Math.max(1, Math.round((now - this.since) / 60_000)) };
  }
}
