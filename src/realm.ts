/**
 * El estado de partida del reino: base de datos, temporada actual y lo que va con
 * ella (primeros del reino, hitos, monedas). Junta las piezas de `core/` y decide
 * cuándo están activas:
 *
 * - Sin base de datos (STATE_DIR sin permisos...), nada de esto funciona, pero el
 *   resto de Skald sí.
 * - Si el servidor tiene otro mundo que la temporada abierta, todo queda en pausa
 *   hasta que un administrador abra la nueva (`openSeason`). Nunca cambia solo.
 */
import path from "node:path";
import { backupDatabase, openStateDatabase, type Database } from "./core/db.js";
import { Economy, type Earning } from "./core/economy.js";
import { FirstsLedger } from "./core/firsts.js";
import { migrateLegacyState } from "./core/legacy-state.js";
import { rank, type MetricId } from "./core/metrics.js";
import { MilestoneTracker, type CrossedMilestone } from "./core/milestones.js";
import { Links } from "./core/links.js";
import { Reminders } from "./core/reminders.js";
import { WeeklyStore } from "./core/weekly.js";
import { Seasons, type Season } from "./core/seasons.js";
import { WorldStats, type PlayerRecord } from "./core/stats.js";
import { readLevelName } from "./core/world.js";
import { log } from "./util/log.js";

/** Lo que se guarda como ranking final al cerrar una temporada. */
export const FINAL_RANKING_METRICS: readonly MetricId[] = ["play_time", "mob_kills", "deaths", "advancements", "distance", "blocks_mined"];
export type FinalRanking = Partial<Record<MetricId, { uuid: string; value: number }[]>>;

const BACKUPS_KEPT = 7;

export interface RealmOptions {
  dataDir: string;
  stateDir: string;
  timeZone: string;
  economy: boolean;
  /** Nombre de la primera temporada si no hay ninguna (p. ej. «Era I»). */
  firstSeasonName: string;
}

export interface RealmTick {
  milestones: CrossedMilestone[];
  earnings: Earning[];
}

export class Realm {
  private db: Database | null = null;
  private seasonsRepo: Seasons | null = null;
  private active: { season: Season; firsts: FirstsLedger; milestones: MilestoneTracker; economy: Economy | null } | null = null;
  /** Mundo nuevo detectado y aún sin temporada (level-name del servidor). */
  private pendingLevel: string | null = null;

  constructor(
    private readonly options: RealmOptions,
    private readonly world: WorldStats,
  ) {}

  get enabled(): boolean {
    return this.db !== null;
  }

  get season(): Season | null {
    return this.active?.season ?? this.seasonsRepo?.current() ?? null;
  }

  /** Mundo nuevo pendiente de temporada, si lo hay. */
  get pendingLevelName(): string | null {
    return this.pendingLevel;
  }

  get seasons(): Seasons | null {
    return this.seasonsRepo;
  }

  private linksRepo: Links | null = null;

  /** Vinculaciones Discord ↔ Minecraft; null sin base de datos. */
  get links(): Links | null {
    if (!this.db) return null;
    this.linksRepo ??= new Links(this.db);
    return this.linksRepo;
  }

  private remindersRepo: Reminders | null = null;

  /** Recordatorios (no dependen de la temporada); null sin base de datos. */
  get reminders(): Reminders | null {
    if (!this.db) return null;
    this.remindersRepo ??= new Reminders(this.db);
    return this.remindersRepo;
  }

  /** Para consultar saldos (también en pausa); null si la economía está apagada. */
  get economy(): Economy | null {
    if (this.active?.economy) return this.active.economy;
    const season = this.season;
    return this.db && this.options.economy && season ? new Economy(this.db, season.id, this.options.timeZone) : null;
  }

  /** Abre la base de datos, la temporada y lo que haya que migrar. No lanza. */
  async init(): Promise<void> {
    try {
      this.db = await openStateDatabase(this.options.stateDir);
    } catch (error) {
      log.warn(`Sin base de datos (primeros, hitos y monedas desactivados): ${errorText(error)}`);
      return;
    }
    this.seasonsRepo = new Seasons(this.db);
    await this.checkSeason();
    const season = this.seasonsRepo.current();
    if (season) {
      try {
        await migrateLegacyState(this.db, this.seasonsRepo, this.options.stateDir, season.id);
      } catch (error) {
        log.warn(`No se pudo pasar el estado antiguo a la base de datos: ${errorText(error)}`);
      }
      // Por si la migración cambió algo de la temporada (primeros ya leídos).
      if (this.active) this.activate(this.seasonsRepo.current() ?? season);
    }
  }

  /**
   * Compara la temporada con el mundo del servidor. Devuelve el level-name nuevo
   * la primera vez que se detecta un cambio (para avisar una sola vez), o null.
   */
  async checkSeason(): Promise<string | null> {
    if (!this.db || !this.seasonsRepo) return null;
    const levelName = await readLevelName(this.options.dataDir);
    const check = this.seasonsRepo.detect(levelName, this.options.firstSeasonName);
    if (check.status === "created") log.info(`Primera temporada abierta: «${check.season.name}» (mundo ${levelName})`);
    if (check.status === "mismatch") {
      const isNew = this.pendingLevel !== levelName;
      if (isNew) log.warn(`El servidor tiene otro mundo (${levelName}) que la temporada «${check.season.name}» (${check.season.levelName}): en pausa hasta abrir temporada`);
      this.pendingLevel = levelName;
      this.active = null;
      // Una sola vez por mundo nuevo, aunque Skald se reinicie.
      const notified = this.db.getMeta("season_mismatch_notified");
      this.db.setMeta("season_mismatch_notified", levelName);
      return notified === levelName ? null : levelName;
    }
    this.pendingLevel = null;
    if (this.active?.season.id !== check.season.id) this.activate(check.season);
    return null;
  }

  /** Antes de seguir el log: apunta en silencio los primeros del histórico. */
  async reconcileFirsts(players?: readonly PlayerRecord[]): Promise<number> {
    if (!this.active) return 0;
    return this.active.firsts.reconcile(players ?? (await this.world.players()));
  }

  private weeklyRepo: WeeklyStore | null = null;

  /** Fotos semanales; null sin base de datos. */
  get weekly(): WeeklyStore | null {
    if (!this.db) return null;
    this.weeklyRepo ??= new WeeklyStore(this.db);
    return this.weeklyRepo;
  }

  /** Lo de la era activa para el resumen semanal; null si no hay (pausa o sin base de datos). */
  get activeSeason(): { season: Season; firsts: FirstsLedger } | null {
    return this.active ? { season: this.active.season, firsts: this.active.firsts } : null;
  }

  getMeta(key: string): string | null {
    return this.db?.getMeta(key) ?? null;
  }

  setMeta(key: string, value: string | null): void {
    this.db?.setMeta(key, value);
  }

  /** Primeros del reino de alguien en la era actual (0 sin base de datos o en pausa). */
  firstsOf(uuid: string, name: string): number {
    return this.active?.firsts.countFor(uuid, name) ?? 0;
  }

  /** ¿Es el primero del reino en esta temporada? (y lo apunta). */
  claimFirst(key: string, player: string, at: Date): boolean {
    return this.active?.firsts.claim(key, player, at) ?? false;
  }

  /** Revisión periódica: primeros, hitos, monedas y copia diaria. */
  async tick(): Promise<RealmTick> {
    const out: RealmTick = { milestones: [], earnings: [] };
    if (!this.db) return out;
    if (this.active) {
      const players = await this.world.players();
      this.active.firsts.reconcile(players);
      out.milestones = this.active.milestones.check(players);
      out.earnings = this.active.economy?.tick(players) ?? [];
    }
    try {
      const made = await backupDatabase(this.db, path.join(this.options.stateDir, "backups"), BACKUPS_KEPT);
      if (made) log.info(`Copia de la base de datos: ${made}`);
    } catch (error) {
      log.warn(`No se pudo copiar la base de datos: ${errorText(error)}`);
    }
    return out;
  }

  /**
   * Cierra la temporada abierta (guardando su ranking final, leído de su propio
   * mundo) y abre otra con el mundo actual del servidor.
   */
  async openSeason(name: string): Promise<{ closed: Season | null; opened: Season }> {
    if (!this.db || !this.seasonsRepo) throw new Error("Sin base de datos");
    const closed = this.seasonsRepo.current();
    let ranking: FinalRanking | null = null;
    if (closed) {
      try {
        const players = await new WorldStats(this.options.dataDir, 0, closed.levelName).players();
        ranking = Object.fromEntries(FINAL_RANKING_METRICS.map((m) => [m, rank(players, m, 3)]));
      } catch (error) {
        log.warn(`Sin ranking final de «${closed.name}»: ${errorText(error)}`);
      }
    }
    const levelName = await readLevelName(this.options.dataDir);
    const opened = this.seasonsRepo.open(name, levelName, ranking);
    this.db.setMeta("season_mismatch_notified", null);
    this.pendingLevel = null;
    this.activate(opened);
    await this.reconcileFirsts().catch((error: unknown) => {
      log.warn(`Primeros de la temporada nueva: ${errorText(error)}`);
    });
    log.info(`Temporada abierta: «${opened.name}» (mundo ${levelName})${closed ? `; cerrada «${closed.name}»` : ""}`);
    return { closed, opened };
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  private activate(season: Season): void {
    if (!this.db || !this.seasonsRepo) return;
    this.active = {
      season,
      firsts: new FirstsLedger(this.db, this.seasonsRepo, season.id),
      milestones: new MilestoneTracker(this.db, season.id),
      economy: this.options.economy ? new Economy(this.db, season.id, this.options.timeZone) : null,
    };
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
