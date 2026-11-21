/**
 * Un adaptador encapsula lo específico de un cargador (vanilla, Fabric,
 * Paper...). En la fase 1 solo existe el adaptador vanilla y se usa para
 * mostrar el cargador en /runas. Irá creciendo con lo que necesiten las fases 2-6
 * (rutas de estadísticas, formato del log, comandos extra...).
 */
export type LoaderId = "vanilla" | "fabric" | "forge" | "neoforge" | "paper";

export interface DetectionInput {
  /** Nombre de versión que devuelve el ping (p. ej. "26.2" o "Paper 26.2"). */
  versionName: string;
}

export interface ServerAdapter {
  readonly id: LoaderId;
  readonly displayName: string;
  /** true si el servidor parece usar este cargador. */
  detect(input: DetectionInput): boolean;
}
