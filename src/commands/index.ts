import { createAyuda } from "./ayuda.js";
import { guerreros } from "./guerreros.js";
import { mapa } from "./mapa.js";
import { reino } from "./reino.js";
import { runas } from "./runas.js";
import type { Command } from "./types.js";

export const commands: readonly Command[] = [reino, guerreros, runas, mapa, createAyuda(() => commands)];

export const commandsByName: ReadonlyMap<string, Command> = new Map(commands.map((c) => [c.data.name, c]));
