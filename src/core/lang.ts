/**
 * Nombres en español (logros, mobs, bloques, objetos). El servidor solo trae
 * el inglés, así que se descarga `es_es.json` de los servidores de Mojang para
 * la versión del servidor y se guarda en memoria. Si falla, se usa el id en
 * formato legible y se reintenta más tarde.
 */
import { z } from "zod";
import { log } from "../util/log.js";

const MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const KEEP_PREFIXES = ["advancements.", "entity.", "block.", "item."];
const RETRY_MS = 10 * 60_000;

export type LangLoader = (version: string) => Promise<ReadonlyMap<string, string>>;

export const fetchSpanishLang: LangLoader = async (version) => {
  const get = async (url: string): Promise<unknown> => {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return res.json();
  };

  const manifest = z
    .object({ versions: z.array(z.object({ id: z.string(), url: z.url() })) })
    .parse(await get(MANIFEST_URL));
  const entry = manifest.versions.find((v) => v.id === version);
  if (!entry) throw new Error(`la versión ${version} no está en el manifiesto de Mojang`);

  const versionInfo = z.object({ assetIndex: z.object({ url: z.url() }) }).parse(await get(entry.url));
  const index = z
    .object({ objects: z.record(z.string(), z.object({ hash: z.string().regex(/^[0-9a-f]{40}$/) })) })
    .parse(await get(versionInfo.assetIndex.url));
  const hash = index.objects["minecraft/lang/es_es.json"]?.hash;
  if (!hash) throw new Error("es_es.json no está en el índice de recursos");

  const lang = z
    .record(z.string(), z.string())
    .parse(await get(`https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`));
  return new Map(Object.entries(lang).filter(([key]) => KEEP_PREFIXES.some((p) => key.startsWith(p))));
};

export class Translator {
  private table: ReadonlyMap<string, string> = new Map();
  private loaded = false;
  private retryAt = 0;
  private loading: Promise<void> | null = null;

  constructor(
    /** Versión del servidor ("26.2", "Paper 26.2"...), o null si no se sabe. */
    private readonly getVersion: () => Promise<string | null>,
    private readonly loader: LangLoader = fetchSpanishLang,
  ) {}

  /** Carga los textos si aún no están (no lanza nunca). */
  async ready(): Promise<void> {
    if (this.loaded || Date.now() < this.retryAt) return;
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    await this.loading;
  }

  private async load(): Promise<void> {
    try {
      const raw = await this.getVersion();
      const version = raw ? /\d+(?:\.\d+)+/.exec(raw)?.[0] : undefined;
      if (!version) throw new Error(`versión del servidor desconocida (${raw ?? "sin respuesta"})`);
      this.table = await this.loader(version);
      this.loaded = true;
      log.info(`Textos en español de Minecraft ${version} cargados (${this.table.size} entradas)`);
    } catch (error) {
      this.retryAt = Date.now() + RETRY_MS;
      log.warn(`Sin textos en español, se usarán los ids: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** "minecraft:nether/explore_nether" → "Cálidos destinos turísticos". */
  advancement(id: string): string {
    const { ns, name } = splitId(id);
    return this.table.get(`advancements.${name.replaceAll("/", ".")}.title`) ?? prettify(name.split("/").pop() ?? name, ns);
  }

  /** "minecraft:zombified_piglin" → "Piglin zombificado". */
  entity(id: string): string {
    const { ns, name } = splitId(id);
    return this.table.get(`entity.${ns}.${name}`) ?? prettify(name, ns);
  }

  /** Bloque u objeto: "minecraft:netherrack" → "Netherrack". */
  blockOrItem(id: string): string {
    const { ns, name } = splitId(id);
    return this.table.get(`block.${ns}.${name}`) ?? this.table.get(`item.${ns}.${name}`) ?? prettify(name, ns);
  }
}

function splitId(id: string): { ns: string; name: string } {
  const colon = id.indexOf(":");
  return colon === -1 ? { ns: "minecraft", name: id } : { ns: id.slice(0, colon), name: id.slice(colon + 1) };
}

/** "zombified_piglin" → "Zombified piglin" (con el namespace si no es de vanilla). */
export function prettify(name: string, ns = "minecraft"): string {
  const text = name.replaceAll("_", " ");
  const pretty = text.charAt(0).toUpperCase() + text.slice(1);
  return ns === "minecraft" ? pretty : `${pretty} (${ns})`;
}
