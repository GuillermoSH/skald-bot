import type { DetectionInput, ServerAdapter } from "./types.js";
import { vanillaAdapter } from "./vanilla.js";

/** De más específico a menos. Vanilla siempre al final: es la base común. */
const ADAPTERS: readonly ServerAdapter[] = [vanillaAdapter];

export function detectAdapter(input: DetectionInput): ServerAdapter {
  return ADAPTERS.find((adapter) => adapter.detect(input)) ?? vanillaAdapter;
}
