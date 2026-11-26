/**
 * Consulta pública de Mojang: nombre de Minecraft → UUID (sin autenticación).
 * Endpoint actual y, de respaldo, el antiguo (comprobados el 2026-11-26). Solo
 * confirma que la cuenta existe, no que sea de quien la reclama.
 */
import { z } from "zod";

export interface MojangProfile {
  /** UUID con guiones, en minúsculas. */
  uuid: string;
  /** Nombre con sus mayúsculas. */
  name: string;
}

export class MojangUnavailableError extends Error {
  override name = "MojangUnavailableError";
}

const ENDPOINTS = [
  (n: string) => `https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(n)}`,
  (n: string) => `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(n)}`,
];

const profileSchema = z.object({ id: z.string().regex(/^[0-9a-f]{32}$/i), name: z.string().regex(/^\w{3,16}$/) });

export function dashedUuid(hex: string): string {
  const h = hex.replaceAll("-", "").toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const CACHE_MS = 10 * 60_000;

export class MojangClient {
  private readonly cache = new Map<string, { at: number; profile: MojangProfile | null }>();

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  /** El perfil, null si no existe; lanza si Mojang no responde. */
  async lookup(name: string): Promise<MojangProfile | null> {
    const key = name.toLowerCase();
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.profile;

    let lastError: unknown = null;
    for (const url of ENDPOINTS) {
      try {
        const res = await this.fetchImpl(url(name), { signal: AbortSignal.timeout(5000) });
        if (res.status === 404 || res.status === 204) {
          this.cache.set(key, { at: Date.now(), profile: null });
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = profileSchema.parse(await res.json());
        const profile = { uuid: dashedUuid(body.id), name: body.name };
        this.cache.set(key, { at: Date.now(), profile });
        return profile;
      } catch (error) {
        lastError = error;
      }
    }
    throw new MojangUnavailableError("Mojang no responde", { cause: lastError });
  }
}
