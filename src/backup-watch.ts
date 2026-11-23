/**
 * Vigila las copias de seguridad y avisa en el canal de administración solo
 * cuando algo va mal (y cuando se recupera). Solo lectura.
 */
import { time, TimestampStyles } from "discord.js";
import { assessBackups, BackupsUnavailableError, listBackups, type BackupStatus } from "./core/backups.js";
import { formatBytes } from "./util/format.js";
import { log } from "./util/log.js";
import { texts } from "./util/texts.js";

const CHECK_MS = 15 * 60_000;

type WatchState = BackupStatus | "unavailable";

export class BackupWatcher {
  /** Último estado del que se avisó (null = aún no se ha comprobado). */
  private last: WatchState | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly dir: string,
    private readonly maxAgeHours: number,
    private readonly send: (message: string, ok: boolean) => Promise<void>,
  ) {}

  start(): void {
    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Una comprobación. Público para las pruebas. */
  async check(now = new Date()): Promise<void> {
    try {
      let state: WatchState;
      let message: string | null = null;
      try {
        const files = await listBackups(this.dir);
        const health = assessBackups(files, now, this.maxAgeHours * 3_600_000);
        state = health.status;
        const { latest, previous } = health;
        if (state === "none") message = texts.backupAlerts.none;
        else if (state === "stale" && latest)
          message = texts.backupAlerts.stale(time(latest.mtime, TimestampStyles.RelativeTime), this.maxAgeHours);
        else if (state === "small" && latest && previous)
          message = texts.backupAlerts.small(formatBytes(latest.size), formatBytes(previous.size));
        else if (state === "ok" && latest && this.last !== null && this.last !== "ok")
          message = texts.backupAlerts.recovered(time(latest.mtime, TimestampStyles.RelativeTime), formatBytes(latest.size));
      } catch (error) {
        if (!(error instanceof BackupsUnavailableError)) throw error;
        state = "unavailable";
        message = texts.backupAlerts.unavailable;
      }

      // Solo se avisa al cambiar de estado (no cada 15 minutos).
      if (state === this.last) return;
      const previousState = this.last;
      this.last = state;
      if (message === null) return; // arranque con todo bien: nada que decir
      log.info(`Copias: ${previousState ?? "inicio"} → ${state}`);
      await this.send(message, state === "ok");
    } catch (error) {
      log.warn(`Vigilancia de copias: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
