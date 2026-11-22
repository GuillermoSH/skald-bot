/**
 * Lector mínimo de zip/jar: extrae UNA entrada sin descomprimir el resto.
 * Solo lo justo para sacar `en_us.json` del jar del servidor (deflate o sin
 * comprimir, sin zip64). Solo lectura.
 */
import { open } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;

export async function readZipEntry(file: string, entryName: string): Promise<Buffer | null> {
  const fh = await open(file, "r");
  try {
    const { size } = await fh.stat();
    // El "fin de directorio central" está en los últimos 22 bytes + comentario (≤ 64 KiB).
    const tailLength = Math.min(size, 22 + 0xffff);
    const tail = Buffer.alloc(tailLength);
    await fh.read(tail, 0, tailLength, size - tailLength);

    let eocd = -1;
    for (let i = tailLength - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === EOCD_SIG) {
        eocd = i;
        break;
      }
    }
    if (eocd === -1) throw new Error(`${file} no es un zip`);

    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    const central = Buffer.alloc(centralSize);
    await fh.read(central, 0, centralSize, centralOffset);

    for (let p = 0; p + 46 <= central.length && central.readUInt32LE(p) === CENTRAL_SIG; ) {
      const method = central.readUInt16LE(p + 10);
      const compressedSize = central.readUInt32LE(p + 20);
      const uncompressedSize = central.readUInt32LE(p + 24);
      const nameLength = central.readUInt16LE(p + 28);
      const extraLength = central.readUInt16LE(p + 30);
      const commentLength = central.readUInt16LE(p + 32);
      const localOffset = central.readUInt32LE(p + 42);
      const name = central.toString("utf8", p + 46, p + 46 + nameLength);

      if (name === entryName) {
        if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`${entryName} es demasiado grande`);
        const local = Buffer.alloc(30);
        await fh.read(local, 0, 30, localOffset);
        if (local.readUInt32LE(0) !== LOCAL_SIG) throw new Error(`cabecera local no válida en ${entryName}`);
        const dataStart = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
        const data = Buffer.alloc(compressedSize);
        await fh.read(data, 0, compressedSize, dataStart);
        if (method === 0) return data;
        if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
        throw new Error(`método de compresión ${method} no soportado`);
      }
      p += 46 + nameLength + extraLength + commentLength;
    }
    return null;
  } finally {
    await fh.close();
  }
}
