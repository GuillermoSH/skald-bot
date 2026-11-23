/**
 * Kit mínimo de pixel art sin dependencias: lienzo con paleta, fuente 5×7,
 * runas, y exportación a PNG y GIF animado (escalado sin suavizado).
 */
import { deflateSync } from "node:zlib";

export type RGB = readonly [number, number, number];

export function hex(color: string): RGB {
  const n = Number.parseInt(color.replace("#", ""), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Generador pseudoaleatorio con semilla (para que las imágenes sean reproducibles). */
export function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export class Canvas {
  readonly pixels: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    fill = 0,
  ) {
    this.pixels = new Uint8Array(width * height).fill(fill);
  }

  set(x: number, y: number, color: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    this.pixels[iy * this.width + ix] = color;
  }

  get(x: number, y: number): number {
    return this.pixels[y * this.width + x] ?? 0;
  }

  rect(x: number, y: number, w: number, h: number, color: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }

  disc(cx: number, cy: number, r: number, color: number): void {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.set(cx + x, cy + y, color);
  }

  line(x0: number, y0: number, x1: number, y1: number, color: number): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) this.set(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, color);
  }

  /** Dibuja un bitmap de filas de texto: los caracteres de `colors` se pintan, el resto se ignora. */
  sprite(x: number, y: number, rows: readonly string[], colors: Readonly<Record<string, number>>): void {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const c = colors[row.charAt(i)];
        if (c !== undefined) this.set(x + i, y + j, c);
      }
    });
  }

  clone(): Canvas {
    const c = new Canvas(this.width, this.height);
    c.pixels.set(this.pixels);
    return c;
  }
}

// ------------------------------------------------------------- fuente 5×7

const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  ",": [".....", ".....", ".....", ".....", ".....", "..#..", ".#..."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
};

const SPACE_WIDTH = 3;

export function textWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += ch === " " ? SPACE_WIDTH : 6;
  return width - 1;
}

/** Texto en mayúsculas con sombra. */
export function drawText(canvas: Canvas, text: string, x: number, y: number, color: number, shadow?: number): void {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    if (ch === " ") {
      cx += SPACE_WIDTH;
      continue;
    }
    const glyph = GLYPHS[ch];
    if (!glyph) throw new Error(`Sin glifo para «${ch}»`);
    if (shadow !== undefined) canvas.sprite(cx + 1, y + 1, glyph, { "#": shadow });
    canvas.sprite(cx, y, glyph, { "#": color });
    cx += 6;
  }
}

export function drawCenteredText(canvas: Canvas, text: string, y: number, color: number, shadow?: number): void {
  drawText(canvas, text, Math.floor((canvas.width - textWidth(text)) / 2), y, color, shadow);
}

// ------------------------------------------------------------- runas (solo neutras)

/** ᚠ fehu, ᚱ raido, ᚲ kaunan, ᚷ gebo. Nunca ᛟ ᛋ ᛉ ᛏ (usadas por extremistas). */
export const RUNES: Record<string, string[]> = {
  fehu: ["#..#.", "#.#.#", "##.#.", "#.#..", "##...", "#....", "#...."],
  raido: ["###..", "#..#.", "#..#.", "###..", "#.#..", "#..#.", "#...#"],
  kaunan: ["....#", "...#.", "..#..", ".#...", "..#..", "...#.", "....#"],
  gebo: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
};

// ------------------------------------------------------------- exportación

function scaled(canvas: Canvas, scale: number): Uint8Array {
  const w = canvas.width * scale;
  const out = new Uint8Array(w * canvas.height * scale);
  for (let y = 0; y < canvas.height * scale; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < w; x++) out[y * w + x] = canvas.get(Math.floor(x / scale), sy);
  }
  return out;
}

// --- PNG

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

export function encodePng(canvas: Canvas, palette: readonly RGB[], scale: number): Buffer {
  const w = canvas.width * scale;
  const h = canvas.height * scale;
  const indices = scaled(canvas, scale);
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = palette[indices[y * w + x] ?? 0] ?? [0, 0, 0];
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array()),
  ]);
}

// --- GIF animado

function lzw(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let dict = new Map<number, number>();
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  const emit = (code: number) => {
    buffer |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      out.push(buffer & 0xff);
      buffer >>>= 8;
      bits -= 8;
    }
  };

  emit(clear);
  let prefix = indices[0] ?? 0;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i] ?? 0;
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      dict = new Map();
      next = eoi + 1;
      codeSize = minCodeSize + 1;
    } else {
      if (next >= 1 << codeSize) codeSize++;
      dict.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) out.push(buffer & 0xff);
  return Uint8Array.from(out);
}

/** GIF animado en bucle. `delayCs`: centésimas de segundo por fotograma. */
export function encodeGif(frames: readonly Canvas[], palette: readonly RGB[], scale: number, delayCs: number): Buffer {
  const first = frames[0];
  if (!first) throw new Error("GIF sin fotogramas");
  const w = first.width * scale;
  const h = first.height * scale;
  const tableBits = Math.max(1, Math.ceil(Math.log2(Math.max(palette.length, 2))));
  const tableSize = 1 << tableBits;
  const minCodeSize = Math.max(2, tableBits);

  const parts: Buffer[] = [];
  const header = Buffer.alloc(13);
  header.write("GIF89a", 0, "ascii");
  header.writeUInt16LE(w, 6);
  header.writeUInt16LE(h, 8);
  header[10] = 0x80 | 0x70 | (tableBits - 1); // tabla global, 8 bits de color
  parts.push(header);

  const table = Buffer.alloc(tableSize * 3);
  palette.forEach(([r, g, b], i) => {
    table.set([r, g, b], i * 3);
  });
  parts.push(table);

  // Bucle infinito (NETSCAPE2.0)
  parts.push(Buffer.from([0x21, 0xff, 0x0b, ...Buffer.from("NETSCAPE2.0"), 0x03, 0x01, 0x00, 0x00, 0x00]));

  for (const frame of frames) {
    parts.push(Buffer.from([0x21, 0xf9, 0x04, 0x04, delayCs & 0xff, delayCs >> 8, 0x00, 0x00]));
    const descriptor = Buffer.alloc(10);
    descriptor[0] = 0x2c;
    descriptor.writeUInt16LE(w, 5);
    descriptor.writeUInt16LE(h, 7);
    parts.push(descriptor, Buffer.from([minCodeSize]));
    const data = lzw(scaled(frame, scale), minCodeSize);
    for (let i = 0; i < data.length; i += 255) {
      const block = data.subarray(i, i + 255);
      parts.push(Buffer.from([block.length]), Buffer.from(block));
    }
    parts.push(Buffer.from([0x00]));
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}
