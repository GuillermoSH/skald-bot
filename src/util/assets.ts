import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { AttachmentBuilder } from "discord.js";
import { log } from "./log.js";

/** assets/ en la raíz del proyecto (src/util → ../../assets; en la imagen, dist/util → /app/assets). */
const ASSETS_DIR = fileURLToPath(new URL("../../assets/", import.meta.url));

export interface Asset {
  file: AttachmentBuilder;
  /** Para usar en un embed: `attachment://nombre`. */
  url: string;
}

/** Imagen de assets/ lista para adjuntar; null (sin romper nada) si no está. */
export function asset(name: string): Asset | null {
  const file = path.join(ASSETS_DIR, name);
  if (!existsSync(file)) {
    log.warn(`Falta la imagen ${name} en ${ASSETS_DIR}: se envía sin ella`);
    return null;
  }
  return { file: new AttachmentBuilder(file, { name }), url: `attachment://${name}` };
}
