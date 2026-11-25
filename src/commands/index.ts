import { createAyuda } from "./ayuda.js";
import { cronica } from "./cronica.js";
import { duelo } from "./duelo.js";
import { gestas } from "./gestas.js";
import { guerreros } from "./guerreros.js";
import { hel } from "./hel.js";
import { mapa } from "./mapa.js";
import { memoria } from "./memoria.js";
import { reino } from "./reino.js";
import { runas } from "./runas.js";
import { regalo } from "./regalo.js";
import { saga } from "./saga.js";
import { temporada } from "./temporada.js";
import { tesoro } from "./tesoro.js";
import type { Command } from "./types.js";

export const commands: readonly Command[] = [
  reino,
  guerreros,
  gestas,
  cronica,
  duelo,
  hel,
  saga,
  tesoro,
  temporada,
  regalo,
  memoria,
  runas,
  mapa,
  createAyuda(() => commands),
];

export const commandsByName: ReadonlyMap<string, Command> = new Map(commands.map((c) => [c.data.name, c]));
