/**
 * Estadísticas en vivo con marcadores (scoreboards) del propio Minecraft.
 *
 * Los ficheros de estadísticas solo se escriben en cada autoguardado (~5 min) y al
 * desconectarse. Un marcador con criterio de estadística (p. ej.
 * `minecraft.custom:minecraft.mob_kills`) sube en el momento, así que Skald pregunta
 * por RCON (`scoreboard players list <jugador>`, solo lectura) y suma a lo del
 * fichero lo que el marcador ha subido **desde que se guardó ese fichero**:
 *
 *   valor en vivo = fichero + (marcador ahora − marcador cuando cambió el fichero)
 *
 * Cada vez que llega un fichero nuevo, el «ancla» se mueve al marcador de ese momento.
 * Como el ancla se toma siempre después de leer el fichero, como mucho se cuenta de
 * menos un rato (nunca de más: no se paga nada dos veces).
 *
 * Los marcadores los crea el servidor al arrancar (`startupCommands()`, en el compose
 * de Minecraft); Skald no escribe nada. Sin marcadores, todo funciona igual que antes.
 */

export type LiveCategory = "custom" | "killed" | "mined";

/** Una estadística con marcador. `scale` la pasa a la unidad de la misión (cm → km). */
export interface LiveTerm {
  category: LiveCategory;
  key: string;
  scale?: number;
}

const PREFIX: Readonly<Record<LiveCategory, string>> = { custom: "c", killed: "k", mined: "m" };
const KEY_RE = /^[a-z0-9_]{1,40}$/;

/** Nombre del marcador: `sk.<c|k|m>.<estadística>` (p. ej. `sk.k.zombie`). */
export function objectiveName(term: Pick<LiveTerm, "category" | "key">): string {
  if (!KEY_RE.test(term.key)) throw new Error(`Estadística no válida: ${term.key}`);
  return `sk.${PREFIX[term.category]}.${term.key}`;
}

/** `scoreboard objectives add …` para crear (una vez, al arrancar el servidor) cada marcador. */
export function startupCommands(terms: readonly LiveTerm[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of terms) {
    const name = objectiveName(term);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(`scoreboard objectives add ${name} minecraft.${term.category}:minecraft.${term.key}`);
  }
  return out;
}

/** Atajos para declarar las estadísticas de cada misión. */
export const live = {
  custom: (...keys: string[]): LiveTerm[] => keys.map((key) => ({ category: "custom", key })),
  killed: (...keys: string[]): LiveTerm[] => keys.map((key) => ({ category: "killed", key })),
  mined: (...keys: string[]): LiveTerm[] => keys.map((key) => ({ category: "mined", key })),
};

/**
 * Lee la respuesta de `scoreboard players list <jugador>` (26.2):
 * «Nombre has 2 score(s):[sk.k.zombie]: 7[sk.c.mob_kills]: 12» o «Nombre has no scores to show».
 * Solo devuelve los marcadores de Skald (`sk.`).
 */
export function parseScores(text: string): Map<string, number> {
  const scores = new Map<string, number>();
  for (const m of text.matchAll(/\[(sk\.[a-z]\.[a-z0-9_]+)\]: (-?\d+)/g)) {
    const name = m[1];
    const value = Number(m[2]);
    if (name !== undefined && Number.isFinite(value)) scores.set(name, value);
  }
  return scores;
}

interface Anchor {
  savedAt: number;
  base: Map<string, number>;
  now: Map<string, number>;
}

/** Lo que han subido los marcadores de cada jugador desde su último guardado. */
export class LiveStats {
  private readonly anchors = new Map<string, Anchor>();

  /**
   * Apunta los marcadores de un jugador conectado. `savedAt` es la fecha del fichero
   * de estadísticas que se leyó **antes** de preguntar por los marcadores.
   */
  update(uuid: string, savedAt: Date | undefined, scores: ReadonlyMap<string, number>): void {
    const saved = savedAt?.getTime() ?? 0;
    const prev = this.anchors.get(uuid);
    if (!prev || prev.savedAt !== saved) {
      // Fichero nuevo (o primera vez): lo de antes ya está dentro del fichero.
      this.anchors.set(uuid, { savedAt: saved, base: new Map(scores), now: new Map(scores) });
      return;
    }
    for (const [name, value] of scores) {
      const base = prev.base.get(name);
      // Marcador nuevo (aparece al subir la primera vez) o que bajó (se recreó): desde 0 / desde aquí.
      if (base === undefined) prev.base.set(name, 0);
      else if (value < base) prev.base.set(name, value);
    }
    prev.now = new Map(scores);
  }

  /** Los que ya no están conectados: lo suyo lo tendrá el fichero que se guarda al salir. */
  keepOnly(uuids: ReadonlySet<string>): void {
    for (const uuid of this.anchors.keys()) if (!uuids.has(uuid)) this.anchors.delete(uuid);
  }

  clear(): void {
    this.anchors.clear();
  }

  /**
   * Lo que se suma a lo del fichero para estas estadísticas (0 si no hay datos).
   * Solo si `savedAt` es el del fichero del ancla: con un fichero más nuevo, lo del
   * marcador ya estaría dentro y se contaría dos veces.
   */
  extra(uuid: string, savedAt: Date | undefined, terms: readonly LiveTerm[]): number {
    const a = this.anchors.get(uuid);
    if (a?.savedAt !== (savedAt?.getTime() ?? 0)) return 0;
    let total = 0;
    for (const term of terms) {
      const name = objectiveName(term);
      const delta = (a.now.get(name) ?? 0) - (a.base.get(name) ?? 0);
      if (delta > 0) total += delta * (term.scale ?? 1);
    }
    return total;
  }
}
