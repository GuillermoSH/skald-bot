import { createAyuda } from "./ayuda.js";
import { cielo } from "./cielo.js";
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
import { encuesta } from "./encuesta.js";
import { quedada } from "./quedada.js";
import { recordatorio } from "./recordatorio.js";
import { saga } from "./saga.js";
import { temporada } from "./temporada.js";
import { ruleta } from "./ruleta.js";
import { tareas } from "./tareas.js";
import { tesoro } from "./tesoro.js";
import { desvincular, vincular } from "./vincular.js";
import type { Command } from "./types.js";

export const commands: readonly Command[] = [
  reino,
  guerreros,
  cielo,
  gestas,
  cronica,
  duelo,
  hel,
  saga,
  tesoro,
  tareas,
  ruleta,
  quedada,
  encuesta,
  recordatorio,
  temporada,
  regalo,
  vincular,
  desvincular,
  memoria,
  runas,
  mapa,
  createAyuda(() => commands),
];

export const commandsByName: ReadonlyMap<string, Command> = new Map(commands.map((c) => [c.data.name, c]));
