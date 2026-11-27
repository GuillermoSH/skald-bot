/**
 * Lector mínimo de NBT (el formato binario de los .dat de Minecraft), solo lectura.
 * Compuestos → objetos, listas → arrays, números → number (los long, como number:
 * los que usamos caben de sobra). Comprimido con gzip o sin comprimir.
 */
import { gunzipSync } from "node:zlib";

export type NbtValue = number | string | NbtValue[] | { [key: string]: NbtValue };

export class NbtError extends Error {
  override name = "NbtError";
}

const MAX_DEPTH = 64;

export function readNbt(raw: Buffer): { [key: string]: NbtValue } {
  const buf = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
  let pos = 0;
  const need = (n: number) => {
    if (pos + n > buf.length) throw new NbtError("NBT truncado");
  };
  const u8 = () => (need(1), buf.readUInt8(pos++));
  const str = () => {
    need(2);
    const n = buf.readUInt16BE(pos);
    pos += 2;
    need(n);
    const s = buf.toString("utf8", pos, pos + n);
    pos += n;
    return s;
  };
  const len = () => {
    need(4);
    const n = buf.readInt32BE(pos);
    pos += 4;
    if (n < 0 || n > 1_000_000) throw new NbtError("Longitud NBT no válida");
    return n;
  };
  const payload = (type: number, depth: number): NbtValue => {
    if (depth > MAX_DEPTH) throw new NbtError("NBT demasiado anidado");
    switch (type) {
      case 1: need(1); return buf.readInt8(pos++);
      case 2: need(2); pos += 2; return buf.readInt16BE(pos - 2);
      case 3: need(4); pos += 4; return buf.readInt32BE(pos - 4);
      case 4: need(8); pos += 8; return Number(buf.readBigInt64BE(pos - 8));
      case 5: need(4); pos += 4; return buf.readFloatBE(pos - 4);
      case 6: need(8); pos += 8; return buf.readDoubleBE(pos - 8);
      case 7: { const n = len(); need(n); const out = [...buf.subarray(pos, pos + n)].map((b) => (b << 24) >> 24); pos += n; return out; }
      case 8: return str();
      case 9: { const t = u8(); const n = len(); return Array.from({ length: n }, () => payload(t, depth + 1)); }
      case 10: {
        const out: { [key: string]: NbtValue } = {};
        for (;;) {
          const t = u8();
          if (t === 0) return out;
          out[str()] = payload(t, depth + 1);
        }
      }
      case 11: { const n = len(); return Array.from({ length: n }, () => payload(3, depth)); }
      case 12: { const n = len(); return Array.from({ length: n }, () => payload(4, depth)); }
      default: throw new NbtError(`Tipo NBT desconocido: ${type}`);
    }
  };
  if (u8() !== 10) throw new NbtError("El NBT no empieza por un compuesto");
  str(); // nombre de la raíz (vacío)
  const root = payload(10, 0);
  if (typeof root !== "object" || Array.isArray(root)) throw new NbtError("Raíz NBT no válida");
  return root;
}
