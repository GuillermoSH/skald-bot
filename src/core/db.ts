/**
 * Base de datos propia de Skald (SQLite, con `node:sqlite`, sin dependencias
 * nativas). Vive en STATE_DIR, **nunca** dentro de la carpeta del mundo.
 *
 * - Migraciones numeradas: `PRAGMA user_version` dice cuál es la última aplicada.
 *   Cada una se aplica entera o nada (transacción). Nunca se edita una ya
 *   publicada: se añade otra al final.
 * - Copia diaria con `VACUUM INTO` a STATE_DIR/backups, con pocas guardadas.
 *
 * `node:sqlite` aún es «experimental» en Node 24; todo el acceso pasa por aquí
 * para que un cambio de su API se arregle en un solo sitio.
 */
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { log } from "../util/log.js";

export const MIGRATIONS: readonly string[] = [
  // 1: temporadas, primeros del reino e hitos.
  `
  CREATE TABLE seasons (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    level_name    TEXT NOT NULL,
    loader        TEXT NOT NULL DEFAULT 'vanilla',
    started_at    TEXT NOT NULL,
    ended_at      TEXT,
    firsts_seeded INTEGER NOT NULL DEFAULT 0,
    final_ranking TEXT
  );
  -- Como mucho una temporada abierta.
  CREATE UNIQUE INDEX seasons_one_open ON seasons ((ended_at IS NULL)) WHERE ended_at IS NULL;

  CREATE TABLE firsts (
    season_id   INTEGER NOT NULL REFERENCES seasons (id),
    key         TEXT NOT NULL,
    player_uuid TEXT,
    player_name TEXT,
    at          TEXT NOT NULL,
    live        INTEGER NOT NULL,
    PRIMARY KEY (season_id, key)
  );

  CREATE TABLE milestones (
    season_id    INTEGER NOT NULL REFERENCES seasons (id),
    uuid         TEXT NOT NULL,
    milestone_id TEXT NOT NULL,
    threshold    REAL NOT NULL,
    PRIMARY KEY (season_id, uuid, milestone_id)
  );

  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // 2: economía (monedas por persona = UUID de Minecraft; el libro solo crece).
  `
  CREATE TABLE ledger (
    id        INTEGER PRIMARY KEY,
    uuid      TEXT NOT NULL,
    amount    INTEGER NOT NULL,
    reason    TEXT NOT NULL,
    season_id INTEGER REFERENCES seasons (id),
    day       TEXT NOT NULL,
    at        TEXT NOT NULL
  );
  CREATE INDEX ledger_uuid ON ledger (uuid);
  CREATE INDEX ledger_day ON ledger (day, uuid, reason);

  -- Último valor ya contado de cada estadística (lo de antes no se vuelve a pagar).
  CREATE TABLE stat_baselines (
    season_id INTEGER NOT NULL REFERENCES seasons (id),
    uuid      TEXT NOT NULL,
    metric    TEXT NOT NULL,
    value     REAL NOT NULL,
    PRIMARY KEY (season_id, uuid, metric)
  );
  `,
  // 3: de dónde se empezó a contar (para el regalo inicial por lo ya jugado).
  `
  CREATE TABLE stat_origins (
    season_id INTEGER NOT NULL REFERENCES seasons (id),
    uuid      TEXT NOT NULL,
    metric    TEXT NOT NULL,
    value     REAL NOT NULL,
    PRIMARY KEY (season_id, uuid, metric)
  );
  -- Quien ya tenía línea base: su origen es esa línea (lo ganado desde entonces es poco).
  INSERT INTO stat_origins (season_id, uuid, metric, value) SELECT season_id, uuid, metric, value FROM stat_baselines;
  `,
  // 4: recordatorios (personales, de canal y avisos previos de quedadas).
  `
  CREATE TABLE reminders (
    id         INTEGER PRIMARY KEY,
    kind       TEXT NOT NULL,
    guild_id   TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    text       TEXT NOT NULL,
    due_at     TEXT NOT NULL,
    created_at TEXT NOT NULL,
    event_id   TEXT,
    sent_at    TEXT,
    error      TEXT
  );
  CREATE INDEX reminders_pending ON reminders (sent_at, due_at);
  `,
  // 5: vinculación Discord ↔ Minecraft (una cuenta por persona, y una persona por cuenta).
  `
  CREATE TABLE links (
    discord_id   TEXT PRIMARY KEY,
    uuid         TEXT NOT NULL UNIQUE,
    mc_name      TEXT NOT NULL,
    status       TEXT NOT NULL,
    linked_at    TEXT NOT NULL,
    linked_by    TEXT,
    activated_at TEXT,
    last_seen    TEXT
  );
  `,
  // 6: fotos semanales de las estadísticas (para el resumen del domingo).
  `
  CREATE TABLE weekly_snapshots (
    season_id INTEGER NOT NULL REFERENCES seasons (id),
    taken_at  TEXT NOT NULL,
    data      TEXT NOT NULL,
    PRIMARY KEY (season_id, taken_at)
  );
  `,
  // 7: tareas diarias (punto de partida del día, misiones cumplidas y rachas).
  `
  CREATE TABLE daily_baselines (
    day    TEXT NOT NULL,
    uuid   TEXT NOT NULL,
    metric TEXT NOT NULL,
    value  REAL NOT NULL,
    PRIMARY KEY (day, uuid, metric)
  );
  CREATE TABLE daily_done (
    day  TEXT NOT NULL,
    uuid TEXT NOT NULL,
    task TEXT NOT NULL,
    at   TEXT NOT NULL,
    PRIMARY KEY (day, uuid, task)
  );
  CREATE TABLE streaks (
    uuid     TEXT PRIMARY KEY,
    current  INTEGER NOT NULL,
    best     INTEGER NOT NULL,
    last_day TEXT NOT NULL
  );
  `,
  // 8: misiones individuales (las de cada jugador cada día, y si cambió alguna) y la semanal del reino.
  `
  CREATE TABLE daily_assignments (
    day      TEXT NOT NULL,
    uuid     TEXT NOT NULL,
    slot     INTEGER NOT NULL,
    task     TEXT NOT NULL,
    rerolled INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, uuid, slot)
  );
  CREATE TABLE weekly_missions (
    week         TEXT PRIMARY KEY,
    mission      TEXT NOT NULL,
    completed_at TEXT
  );
  CREATE TABLE weekly_mission_baselines (
    week  TEXT NOT NULL,
    uuid  TEXT NOT NULL,
    value REAL NOT NULL,
    PRIMARY KEY (week, uuid)
  );
  `,
];

export class Database {
  readonly raw: DatabaseSync;

  constructor(file: string) {
    this.raw = new DatabaseSync(file);
    // temp_store en memoria: en Docker el sistema de ficheros es de solo lectura (sin /tmp).
    this.raw.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA temp_store = MEMORY;");
    if (file !== ":memory:") this.raw.exec("PRAGMA journal_mode = WAL;");
  }

  get version(): number {
    const row = this.raw.prepare("PRAGMA user_version").get() as { user_version: number } | undefined;
    return row?.user_version ?? 0;
  }

  /** Aplica las migraciones que falten. Devuelve cuántas. */
  migrate(migrations: readonly string[] = MIGRATIONS): number {
    const from = this.version;
    if (from > migrations.length) {
      throw new Error(`La base de datos es de una versión más nueva de Skald (${from} > ${migrations.length})`);
    }
    for (let v = from; v < migrations.length; v++) {
      this.transaction(() => {
        this.raw.exec(migrations[v] ?? "");
        this.raw.exec(`PRAGMA user_version = ${v + 1}`);
      });
    }
    return migrations.length - from;
  }

  transaction<T>(fn: () => T): T {
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.raw.exec("COMMIT");
      return result;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }

  // El tipo de la fila lo pone quien escribe la consulta (SQLite no lo sabe).
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.raw.prepare(sql).get(...params) as T | undefined;
  }

  all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.raw.prepare(sql).all(...params) as T[];
  }

  run(sql: string, ...params: SQLInputValue[]): { changes: number; lastId: number } {
    const r = this.raw.prepare(sql).run(...params);
    return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
  }

  getMeta(key: string): string | null {
    return this.get<{ value: string }>("SELECT value FROM meta WHERE key = ?", key)?.value ?? null;
  }

  setMeta(key: string, value: string | null): void {
    if (value === null) this.run("DELETE FROM meta WHERE key = ?", key);
    else this.run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", key, value);
  }

  close(): void {
    this.raw.close();
  }
}

/** Abre (o crea) la base de datos de STATE_DIR y la pone al día. */
export async function openStateDatabase(stateDir: string): Promise<Database> {
  await mkdir(stateDir, { recursive: true });
  const db = new Database(path.join(stateDir, "skald.db"));
  const applied = db.migrate();
  if (applied > 0) log.info(`Base de datos al día (versión ${db.version}, ${applied} migraciones aplicadas)`);
  return db;
}

const BACKUP_RE = /^skald-(\d{8})\.db$/;

/**
 * Copia de la base de datos del día (una por día; si ya existe, no hace nada) y
 * borra las más antiguas, dejando `keep`. Ojo: es el mismo disco; no sustituye
 * a una copia fuera de la máquina.
 */
export async function backupDatabase(db: Database, dir: string, keep: number, now = new Date()): Promise<string | null> {
  await mkdir(dir, { recursive: true });
  const stamp = now.toISOString().slice(0, 10).replaceAll("-", "");
  const name = `skald-${stamp}.db`;
  const files = (await readdir(dir)).filter((f) => BACKUP_RE.test(f)).sort();
  let made: string | null = null;
  if (!files.includes(name)) {
    const target = path.join(dir, name);
    // VACUUM INTO no admite parámetros: la ruta la construimos nosotros y no lleva comillas.
    if (target.includes("'")) throw new Error("Ruta de copia no válida");
    db.raw.exec(`VACUUM INTO '${target}'`);
    files.push(name);
    files.sort();
    made = name;
  }
  for (const old of files.slice(0, Math.max(0, files.length - keep))) {
    await rm(path.join(dir, old), { force: true });
  }
  return made;
}
