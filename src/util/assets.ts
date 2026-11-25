import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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

/**
 * Imagen de assets/ lista para adjuntar; null (sin romper nada) si no está.
 * Con `versioned`, el adjunto lleva una huella del contenido en el nombre
 * (runas-1a2b3c4d.png): así se nota si la imagen ha cambiado.
 */
export function asset(name: string, options: { versioned?: boolean } = {}): Asset | null {
  const file = path.join(ASSETS_DIR, name);
  if (!existsSync(file)) {
    log.warn(`Falta la imagen ${name} en ${ASSETS_DIR}: se envía sin ella`);
    return null;
  }
  let attachmentName = name;
  if (options.versioned) {
    const hash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8);
    const ext = path.extname(name);
    attachmentName = `${path.basename(name, ext)}-${hash}${ext}`;
  }
  return { file: new AttachmentBuilder(file, { name: attachmentName }), url: `attachment://${attachmentName}` };
}

/** Ruta en disco de una imagen de assets/ (para APIs que piden un fichero), o null si no está. */
export function assetPath(name: string): string | null {
  const file = path.join(ASSETS_DIR, name);
  return existsSync(file) ? file : null;
}

/** Nombre del fichero de una URL de imagen (attachment://x.png o la del CDN de Discord). */
export function imageFileName(url: string | undefined): string | null {
  if (!url) return null;
  return url.split("?")[0]?.split("/").pop() ?? null;
}
