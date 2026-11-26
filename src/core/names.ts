/**
 * UUID → nombre de jugador. Primero `usercache.json` del servidor (sus
 * entradas caducan a los 30 días); si no está, la API pública de Mojang
 * (válido con ONLINE_MODE, donde los UUID son los oficiales). Todo en memoria.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { isValidPlayerName } from "../util/escape.js";
import { log } from "../util/log.js";

const usercacheSchema = z.array(z.object({ name: z.string(), uuid: z.string() }));
const mojangProfileSchema = z.object({ name: z.string() });

const RETRY_FAILED_MS = 10 * 60_000;

export class NameResolver {
  private readonly known = new Map<string, string>();
  private readonly failedAt = new Map<string, number>();
  private usercacheAt = 0;
  private usercacheLoading: Promise<void> | null = null;

  constructor(
    private readonly dataDir: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly ttlMs = 60_000,
  ) {}

  /** Nombres ya conocidos, sin red (para el autocompletado, que tiene 3 s). */
  async peek(uuids: readonly string[]): Promise<Map<string, string>> {
    await this.refreshUsercache();
    const out = new Map<string, string>();
    for (const uuid of uuids) {
      const name = this.known.get(uuid.toLowerCase());
      if (name) out.set(uuid, name);
    }
    return out;
  }

  /** UUID de un nombre según usercache.json (el servidor lo escribe al entrar), o null. */
  async uuidOf(name: string): Promise<string | null> {
    await this.refreshUsercache();
    const wanted = name.toLowerCase();
    for (const [uuid, known] of this.known) if (known.toLowerCase() === wanted) return uuid;
    return null;
  }

  /** Olvida la caché para releer usercache.json en la próxima consulta (alguien acaba de entrar). */
  invalidate(): void {
    this.usercacheAt = 0;
  }

  /** Resuelve todos los que pueda; los que no, no aparecen en el mapa. */
  async resolve(uuids: readonly string[]): Promise<Map<string, string>> {
    const out = await this.peek(uuids);
    const missing = uuids.filter((u) => !out.has(u));
    const fetched = await Promise.all(missing.map(async (u) => [u, await this.fromMojang(u)] as const));
    for (const [uuid, name] of fetched) if (name) out.set(uuid, name);
    return out;
  }

  private refreshUsercache(): Promise<void> {
    // Las consultas simultáneas esperan a la misma lectura (si no, verían el mapa aún vacío).
    if (this.usercacheLoading) return this.usercacheLoading;
    if (Date.now() - this.usercacheAt < this.ttlMs) return Promise.resolve();
    this.usercacheLoading = this.readUsercache().finally(() => {
      this.usercacheAt = Date.now();
      this.usercacheLoading = null;
    });
    return this.usercacheLoading;
  }

  private async readUsercache(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(path.join(this.dataDir, "usercache.json"), "utf8")) as unknown;
      for (const { name, uuid } of usercacheSchema.parse(raw)) {
        if (isValidPlayerName(name)) this.known.set(uuid.toLowerCase(), name);
      }
    } catch (error) {
      log.debug(`usercache.json no disponible: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async fromMojang(uuid: string): Promise<string | null> {
    const key = uuid.toLowerCase();
    const failed = this.failedAt.get(key);
    if (failed !== undefined && Date.now() - failed < RETRY_FAILED_MS) return null;
    try {
      const res = await this.fetchImpl(
        `https://sessionserver.mojang.com/session/minecraft/profile/${key.replaceAll("-", "")}`,
        { signal: AbortSignal.timeout(3000) },
      );
      if (res.ok) {
        const body = mojangProfileSchema.safeParse(await res.json());
        if (body.success && isValidPlayerName(body.data.name)) {
          this.known.set(key, body.data.name);
          return body.data.name;
        }
      }
    } catch {
      // Sin red o Mojang caído: se reintenta más tarde.
    }
    this.failedAt.set(key, Date.now());
    return null;
  }
}
