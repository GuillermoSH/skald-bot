import type { ServerAdapter } from "./types.js";

/** Base común: vale para cualquier servidor, así que siempre "detecta". */
export const vanillaAdapter: ServerAdapter = {
  id: "vanilla",
  displayName: "Vanilla",
  detect: () => true,
};
