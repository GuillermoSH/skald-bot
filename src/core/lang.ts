/**
 * Textos de Minecraft en dos idiomas:
 * - es_es: se descarga de los servidores de recursos de Mojang (el servidor no lo trae).
 * - en_us: se lee del jar del servidor (DATA_DIR/versions/<v>/server-<v>.jar), en solo lectura.
 *
 * Con los dos se puede: traducir ids (logros, mobs, bloques), reconocer las
 * muertes del log con las plantillas oficiales (`death.*`) y reescribirlas en
 * español, y traducir del inglés lo que el log escribe en inglés.
 * Si algo falla se usan textos de respaldo y se reintenta más tarde.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { log } from "../util/log.js";
import { readZipEntry } from "./zip.js";

const MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const KEEP_PREFIXES = ["advancements.", "entity.", "block.", "item.", "death."];
const RETRY_MS = 10 * 60_000;

export type LangTable = ReadonlyMap<string, string>;
export type LangLoader = (version: string) => Promise<LangTable>;

const langFileSchema = z.record(z.string(), z.string());

function keepRelevant(lang: Record<string, string>): LangTable {
  return new Map(Object.entries(lang).filter(([key]) => KEEP_PREFIXES.some((p) => key.startsWith(p))));
}

// ------------------------------------------------------------- cargadores

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

  return keepRelevant(langFileSchema.parse(await get(`https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`)));
};

/** en_us.json desde el jar del servidor (vanilla lo deja en versions/<v>/server-<v>.jar). */
export function jarEnglishLoader(dataDir: string): LangLoader {
  return async (version) => {
    const versionsDir = path.join(dataDir, "versions");
    const others = await readdir(versionsDir).catch(() => [] as string[]);
    const candidates = [version, ...others.filter((v) => v !== version)].map((v) =>
      path.join(versionsDir, v, `server-${v}.jar`),
    );
    for (const jar of candidates) {
      try {
        const data = await readZipEntry(jar, "assets/minecraft/lang/en_us.json");
        if (data) return keepRelevant(langFileSchema.parse(JSON.parse(data.toString("utf8"))));
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    }
    throw new Error(`no encuentro en_us.json en el jar del servidor (${versionsDir})`);
  };
}

// ------------------------------------------------------------- plantillas

const PLACEHOLDER_RE = /%(?:(\d+)\$)?s/g;
const PLAYER_NAME_PATTERN = "[A-Za-z0-9_]{3,16}";

/** Índices de argumento de una plantilla, en orden de aparición ("%1$s … %2$s" → [1, 2]). */
function placeholderIndices(template: string): number[] {
  let sequential = 0;
  return [...template.matchAll(PLACEHOLDER_RE)].map((m) => (m[1] ? Number(m[1]) : ++sequential));
}

/** Rellena una plantilla de Minecraft con argumentos (posicionales o en orden). */
export function fillTemplate(template: string, args: readonly string[]): string {
  let sequential = 0;
  return template.replace(PLACEHOLDER_RE, (_, index: string | undefined) => {
    const i = index ? Number(index) : ++sequential;
    return args[i - 1] ?? "";
  });
}

interface DeathPattern {
  key: string;
  regex: RegExp;
  indices: number[];
  combat: boolean;
}

/** Convierte "%1$s was slain by %2$s" en una regex anclada; %1$s siempre es un jugador. */
function compileDeathPattern(key: string, template: string): DeathPattern {
  const indices = placeholderIndices(template);
  const literals = template.split(PLACEHOLDER_RE).filter((_, i) => i % 2 === 0);
  let source = "^";
  literals.forEach((literal, i) => {
    source += literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const index = indices[i];
    if (index !== undefined) source += index === 1 ? `(${PLAYER_NAME_PATTERN})` : "(.+?)";
  });
  return { key, regex: new RegExp(`${source}$`), indices, combat: indices.some((i) => i >= 2) };
}

export interface DeathMatch {
  key: string;
  /** args[0] es el jugador; el resto, en el orden de la plantilla (%2$s, %3$s...). */
  args: string[];
  /** Hay un asesino (mob o jugador): muerte en combate. */
  combat: boolean;
}

// ------------------------------------------------------------- traductor

export class Translator {
  private es: LangTable = new Map();
  private esLoaded = false;
  private enLoaded = false;
  private retryAt = 0;
  private loading: Promise<void> | null = null;

  /** Nombre en inglés (minúsculas) → clave (entity./item./block.). */
  private englishNames = new Map<string, string>();
  /** Título de logro en inglés → clave. */
  private englishTitles = new Map<string, string>();
  private deathPatterns: DeathPattern[] = [];

  constructor(
    /** Versión del servidor ("26.2", "Paper 26.2"...), o null si no se sabe. */
    private readonly getVersion: () => Promise<string | null>,
    private readonly spanishLoader: LangLoader = fetchSpanishLang,
    private readonly englishLoader: LangLoader | null = null,
  ) {}

  /** Carga lo que falte (no lanza nunca). */
  async ready(): Promise<void> {
    const pending = !this.esLoaded || (this.englishLoader !== null && !this.enLoaded);
    if (!pending || Date.now() < this.retryAt) return;
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    await this.loading;
  }

  private async load(): Promise<void> {
    let version: string | undefined;
    try {
      const raw = await this.getVersion();
      version = raw ? /\d+(?:\.\d+)+/.exec(raw)?.[0] : undefined;
      if (!version) throw new Error(`versión del servidor desconocida (${raw ?? "sin respuesta"})`);
    } catch (error) {
      this.fail("textos de Minecraft", error);
      return;
    }

    if (!this.esLoaded) {
      try {
        this.es = await this.spanishLoader(version);
        this.esLoaded = true;
        log.info(`Textos en español de Minecraft ${version} cargados (${this.es.size} entradas)`);
      } catch (error) {
        this.fail("textos en español", error);
      }
    }
    if (this.englishLoader && !this.enLoaded) {
      try {
        this.indexEnglish(await this.englishLoader(version));
        this.enLoaded = true;
        log.info(`Plantillas en inglés cargadas del jar (${this.deathPatterns.length} muertes)`);
      } catch (error) {
        this.fail("plantillas en inglés", error);
      }
    }
  }

  private fail(what: string, error: unknown): void {
    this.retryAt = Date.now() + RETRY_MS;
    log.warn(`Sin ${what}, se usarán textos de respaldo: ${error instanceof Error ? error.message : String(error)}`);
  }

  private indexEnglish(en: LangTable): void {
    const names = new Map<string, string>();
    const titles = new Map<string, string>();
    const patterns: DeathPattern[] = [];
    for (const [key, value] of en) {
      if (/^(entity|item|block)\./.test(key) && !names.has(value.toLowerCase())) names.set(value.toLowerCase(), key);
      else if (key.startsWith("advancements.") && key.endsWith(".title")) titles.set(value, key);
      else if (key.startsWith("death.") && value.includes("%")) patterns.push(compileDeathPattern(key, value));
    }
    // Las plantillas con más texto fijo primero: son más específicas.
    const literalLength = (p: DeathPattern) => p.regex.source.replace(/\(.*?\)/g, "").length;
    patterns.sort((a, b) => literalLength(b) - literalLength(a));
    this.englishNames = names;
    this.englishTitles = titles;
    this.deathPatterns = patterns;
  }

  // ---- muertes

  hasDeathTemplates(): boolean {
    return this.deathPatterns.length > 0;
  }

  /** Reconoce un mensaje de muerte del log ("Ragnar was blown up by Creeper"). */
  matchDeath(message: string): DeathMatch | null {
    for (const pattern of this.deathPatterns) {
      const m = pattern.regex.exec(message);
      if (!m) continue;
      const args: string[] = [];
      pattern.indices.forEach((index, i) => (args[index - 1] = m[i + 1] ?? ""));
      return { key: pattern.key, args, combat: pattern.combat };
    }
    return null;
  }

  /** La muerte en español, o null si no hay plantilla es_es. */
  renderDeath(death: DeathMatch): string | null {
    const template = this.es.get(death.key);
    if (!template) return null;
    const args = death.args.map((arg, i) => (i === 0 ? arg : this.fromEnglishName(arg)));
    return fillTemplate(template, args);
  }

  // ---- del inglés del log al español

  /** "Zombified Piglin" → "Piglin zombificado"; "[Iron Spear]" → "[Lanza de hierro]"; si no, igual. */
  fromEnglishName(name: string): string {
    const bracketed = /^\[(.*)\]$/.exec(name);
    const inner = bracketed?.[1] ?? name;
    const key = this.englishNames.get(inner.toLowerCase());
    const translated = (key && this.es.get(key)) ?? inner;
    return bracketed ? `[${translated}]` : translated;
  }

  /** Clave de idioma del logro a partir de su título en inglés del log, o null si no se conoce. */
  advancementKeyFromEnglishTitle(title: string): string | null {
    return this.englishTitles.get(title) ?? null;
  }

  /** "Hot Tourist Destinations" → "Cálidos destinos turísticos"; si no, igual. */
  fromEnglishAdvancementTitle(title: string): string {
    const key = this.englishTitles.get(title);
    return (key && this.es.get(key)) ?? title;
  }

  // ---- ids

  /** "minecraft:nether/explore_nether" → "Cálidos destinos turísticos". */
  advancement(id: string): string {
    const { ns, name } = splitId(id);
    return this.es.get(advancementKey(id)) ?? prettify(name.split("/").pop() ?? name, ns);
  }

  /** "minecraft:zombified_piglin" → "Piglin zombificado". */
  entity(id: string): string {
    const { ns, name } = splitId(id);
    return this.es.get(`entity.${ns}.${name}`) ?? prettify(name, ns);
  }

  /** Bloque u objeto: "minecraft:netherrack" → "Netherrack". */
  blockOrItem(id: string): string {
    const { ns, name } = splitId(id);
    return this.es.get(`block.${ns}.${name}`) ?? this.es.get(`item.${ns}.${name}`) ?? prettify(name, ns);
  }
}

/**
 * Clave de idioma del título de un logro: "minecraft:nether/explore_nether" →
 * "advancements.nether.explore_nether.title". Es la misma que sale del título del
 * log, así que sirve para identificar un logro venga de donde venga.
 */
export function advancementKey(id: string): string {
  return `advancements.${splitId(id).name.replaceAll("/", ".")}.title`;
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
