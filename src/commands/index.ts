import { createAyuda } from "./ayuda.js";
import { cronica } from "./cronica.js";
import { gestas } from "./gestas.js";
import { guerreros } from "./guerreros.js";
import { mapa } from "./mapa.js";
import { memoria } from "./memoria.js";
import { reino } from "./reino.js";
import { runas } from "./runas.js";
import { saga } from "./saga.js";
import type { Command } from "./types.js";

export const commands: readonly Command[] = [
  reino,
  guerreros,
  gestas,
  cronica,
  saga,
  memoria,
  runas,
  mapa,
  createAyuda(() => commands),
];

export const commandsByName: ReadonlyMap<string, Command> = new Map(commands.map((c) => [c.data.name, c]));
