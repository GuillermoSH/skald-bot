import type { LogEvent } from "./logwatch.js";

/** Últimos eventos del log en memoria (para /saga). */
export class Chronicle {
  private readonly events: LogEvent[] = [];

  constructor(private readonly max = 200) {}

  add(event: LogEvent): void {
    this.events.push(event);
    if (this.events.length > this.max) this.events.splice(0, this.events.length - this.max);
  }

  /** Los más recientes primero. */
  recent<T extends LogEvent["type"]>(types: readonly T[], limit: number): Extract<LogEvent, { type: T }>[] {
    const out: Extract<LogEvent, { type: T }>[] = [];
    for (let i = this.events.length - 1; i >= 0 && out.length < limit; i--) {
      const event = this.events[i];
      if (event && (types as readonly string[]).includes(event.type)) out.push(event as Extract<LogEvent, { type: T }>);
    }
    return out;
  }
}
