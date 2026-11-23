/**
 * Genera las imágenes en pixel art de Skald (diseño propio) en assets/:
 *   pnpm art
 * Mismo estilo que el avatar y el banner: noche, luna de brasas, drakkar, cuervo y ascuas.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Canvas, drawCenteredText, encodeGif, encodePng, hex, prng, RUNES } from "./pixel.js";

// ------------------------------------------------------------- paleta

const P = {
  sky0: 0, sky1: 1, sky2: 2, emberDark: 3, brasa: 4, amber: 5, orange: 6, gold: 7, light: 8,
  black: 9, sea: 10, seaGlow: 11, star: 12, stone0: 13, stone1: 14, stone2: 15, sail: 16,
  fog0: 17, fog1: 18, gem0: 19, gem1: 20, gem2: 21, white: 22,
} as const;

const PALETTE = [
  "#0b0a12", "#1a0f17", "#2a0d08", "#5c1a0b", "#a82814", "#d65218", "#e67a22", "#f2b35a", "#ffe3a3",
  "#050304", "#120a0c", "#3a130c", "#c9c3d9", "#2b2a30", "#4a4850", "#6e6b76", "#7a160c",
  "#2e2838", "#4a4058", "#6b1f5c", "#c94bb0", "#ffb3f0", "#ffffff",
].map(hex);

const W = 160;
const H = 60;
const SCALE = 4;
const FRAMES = 8;
const OUT = path.resolve("assets");

// ------------------------------------------------------------- piezas

function sky(c: Canvas, horizon: number): void {
  for (let y = 0; y < horizon; y++) {
    const t = y / horizon;
    const color = t < 0.35 ? P.sky0 : t < 0.7 ? P.sky1 : P.sky2;
    for (let x = 0; x < c.width; x++) {
      // Tramado en los cambios de banda para que el degradado no sea plano.
      const dither = (x + y) % 2 === 0 && Math.abs(t - 0.35) < 0.04 ? P.sky1 : color;
      c.set(x, y, dither);
    }
  }
}

function stars(c: Canvas, horizon: number, frame: number, seed: number): void {
  const rnd = prng(seed);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rnd() * c.width);
    const y = Math.floor(rnd() * horizon * 0.7);
    const phase = (i + frame) % 6;
    if (phase === 0) continue; // parpadeo
    c.set(x, y, phase === 3 ? P.white : P.star);
  }
}

function moon(c: Canvas, cx: number, cy: number, r: number): void {
  c.disc(cx, cy, r + 2, P.emberDark);
  c.disc(cx, cy, r, P.amber);
  c.disc(cx - 2, cy - 2, r - 4, P.orange);
  c.disc(cx - 4, cy - 4, Math.max(2, r - 10), P.gold);
  // Cráteres
  for (const [dx, dy, s] of [[5, 3, 2], [-6, 6, 1], [2, -7, 1], [8, -2, 1]] as const) c.disc(cx + dx, cy + dy, s, P.brasa);
}

function sea(c: Canvas, horizon: number, frame: number, moonX: number, moonW: number): void {
  for (let y = horizon; y < c.height; y++) for (let x = 0; x < c.width; x++) c.set(x, y, P.sea);
  for (let x = 0; x < c.width; x++) c.set(x, horizon, P.seaGlow);
  // Reflejo de la luna: franjas que brillan y se desplazan.
  for (let y = horizon + 1; y < c.height; y += 2) {
    const width = moonW - (y - horizon);
    const shift = ((frame + y) % 3) - 1;
    for (let x = -width / 2; x < width / 2; x++) {
      if ((Math.floor(x) + frame + y) % 4 === 0) continue;
      c.set(moonX + x + shift, y, (y + frame) % 4 === 0 ? P.orange : P.amber);
    }
  }
}

/** Drakkar mirando a la derecha. (x, wl) = extremo izquierdo y línea de flotación. */
function drakkar(c: Canvas, x: number, wl: number, size = 1): void {
  const len = Math.round(44 * size);
  const mast = x + Math.round(len * 0.5);
  const mastTop = wl - Math.round(26 * size);
  // Casco: banda curva con popa y proa levantadas.
  for (let i = 0; i <= len; i++) {
    const t = i / len;
    const lift = Math.round((Math.pow(Math.abs(t - 0.5) * 2, 3) * 7) * size);
    const top = wl - Math.round(4 * size) - lift;
    const bottom = wl - Math.round(lift * 0.4);
    c.line(x + i, top, x + i, bottom, P.black);
  }
  // Cabeza de dragón en la proa y cola en la popa.
  const prowX = x + len;
  const prowY = wl - Math.round(11 * size);
  c.sprite(prowX - 2, prowY - 3, ["..##.", ".####", "##.##", "#..#.", "#...."], { "#": P.black });
  c.set(prowX + 1, prowY - 1, P.orange); // ojo
  c.sprite(x - 2, wl - Math.round(12 * size), [".#", "#.", "#.", ".#"], { "#": P.black });
  // Escudos
  for (let i = 6; i < len - 4; i += 5) {
    const sx = x + i;
    const sy = wl - Math.round(3 * size);
    c.disc(sx, sy, size >= 1 ? 1 : 0, i % 10 === 6 ? P.amber : P.brasa);
  }
  // Mástil, verga y vela a rayas.
  c.line(mast, wl - 3, mast, mastTop, P.black);
  const sailW = Math.round(22 * size);
  const sailH = Math.round(14 * size);
  const sailTop = mastTop + Math.round(3 * size);
  c.line(mast - sailW / 2 - 1, sailTop - 1, mast + sailW / 2 + 1, sailTop - 1, P.black);
  for (let j = 0; j < sailH; j++) {
    const bulge = Math.round(Math.sin((j / sailH) * Math.PI) * 2 * size);
    for (let i = -sailW / 2 - bulge; i <= sailW / 2 + bulge; i++) {
      const stripe = Math.floor((i + sailW) / Math.max(2, Math.round(3 * size))) % 2 === 0;
      c.set(mast + i, sailTop + j, stripe ? P.brasa : P.sail);
    }
  }
  // Cuervo en lo alto del mástil.
  if (size >= 1) c.sprite(mast - 2, mastTop - 3, [".##..", "####>", "..#.."], { "#": P.black, ">": P.black });
}

function embers(c: Canvas, frame: number, seed: number, count: number): void {
  const rnd = prng(seed);
  for (let i = 0; i < count; i++) {
    const x0 = rnd() * c.width;
    const y0 = rnd() * c.height;
    const speed = 1 + Math.floor(rnd() * 3);
    const y = (((y0 - frame * speed) % c.height) + c.height) % c.height;
    const x = x0 + Math.sin((frame + i) * 0.8) * 1.5;
    c.set(x, y, i % 3 === 0 ? P.gold : P.orange);
    if (i % 4 === 0) c.set(x, y + 1, P.brasa);
  }
}

function frames(draw: (c: Canvas, frame: number) => void, width = W, height = H): Canvas[] {
  return Array.from({ length: FRAMES }, (_, f) => {
    const c = new Canvas(width, height);
    draw(c, f);
    return c;
  });
}

// ------------------------------------------------------------- escenas

/** Bienvenida: el drakkar llega a la luz de la luna de brasas. */
const welcome = frames((c, f) => {
  const horizon = 44;
  sky(c, horizon);
  stars(c, horizon, f, 7);
  moon(c, 118, 30, 16);
  sea(c, horizon, f, 118, 30);
  drakkar(c, 44, 47 + (f % 4 < 2 ? 0 : 1));
  embers(c, f, 11, 18);
  drawCenteredText(c, "BIENVENIDO AL REINO", 4, P.gold, P.brasa);
});

/** Despedida: el drakkar se aleja entre la niebla. */
const farewell = frames((c, f) => {
  const horizon = 40;
  sky(c, horizon);
  stars(c, horizon, f, 21);
  moon(c, 40, 38, 20);
  sea(c, horizon, f, 40, 36);
  drakkar(c, 96, 43, 0.6);
  // Bancos de niebla que se desplazan.
  for (const [y, speed, color] of [[44, 1, P.fog0], [50, 2, P.fog1], [56, 1, P.fog0]] as const) {
    for (let x = 0; x < c.width; x++) {
      const wave = Math.sin((x + f * speed * 2) * 0.12) * 2;
      if ((x + f * speed) % 7 !== 0) c.set(x, y + wave, color);
      if ((x + f) % 3 === 0) c.set(x, y + wave + 1, color);
    }
  }
  drawCenteredText(c, "BUEN VIAJE, GUERRERO", 4, P.gold, P.brasa);
});

/** Boost: una gema ofrendada al reino, con destellos. */
const boost = frames((c, f) => {
  sky(c, H);
  stars(c, H, f, 33);
  embers(c, f, 5, 14);
  const cx = W / 2;
  const cy = 34;
  // Halo
  c.disc(cx, cy, 16, P.sky1);
  c.disc(cx, cy, 13, P.emberDark);
  // Gema (rombo tallado)
  for (let y = -11; y <= 11; y++) {
    const half = 11 - Math.abs(y);
    for (let x = -half; x <= half; x++) {
      const facet = y < -3 ? (x < 0 ? P.gem2 : P.gem1) : x < -half / 3 ? P.gem1 : x > half / 3 ? P.gem0 : P.gem1;
      c.set(cx + x, cy + y, facet);
    }
  }
  c.line(cx - 8, cy - 3, cx + 8, cy - 3, P.gem2);
  c.set(cx - 4, cy - 7, P.white);
  c.set(cx - 3, cy - 8, P.white);
  // Destellos en cruz que giran alrededor.
  for (let i = 0; i < 4; i++) {
    const a = ((f + i * 2) / FRAMES) * Math.PI * 2;
    const sx = cx + Math.cos(a) * 22;
    const sy = cy + Math.sin(a) * 12;
    const big = (f + i) % 2 === 0;
    c.set(sx, sy, P.white);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) c.set(sx + dx, sy + dy, big ? P.gem2 : P.gold);
    if (big) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) c.set(sx + dx, sy + dy, P.gem1);
  }
  drawCenteredText(c, "OFRENDA AL REINO", 4, P.gold, P.brasa);
});

/** Cabecera de las runas: piedra rúnica con runas que brillan (estática). */
function rulesBanner(): Canvas {
  const c = new Canvas(W, 44);
  sky(c, 44);
  stars(c, 44, 1, 51);
  // Piedra
  const rnd = prng(77);
  for (let y = 14; y < 42; y++) {
    const inset = y < 17 ? 17 - y : y > 39 ? y - 39 : 0;
    for (let x = 26 + inset; x < W - 26 - inset; x++) {
      const n = rnd();
      c.set(x, y, n < 0.15 ? P.stone2 : n < 0.75 ? P.stone1 : P.stone0);
    }
  }
  // Runas talladas con brillo de brasa.
  const runes = ["fehu", "raido", "kaunan", "gebo", "fehu", "raido", "kaunan", "gebo"];
  runes.forEach((name, i) => {
    const glyph = RUNES[name];
    if (!glyph) return;
    const x = 36 + i * 12;
    c.sprite(x + 1, 25, glyph, { "#": P.emberDark });
    c.sprite(x, 24, glyph, { "#": i % 2 === 0 ? P.amber : P.orange });
  });
  embers(c, 3, 9, 10);
  drawCenteredText(c, "LAS RUNAS DEL REINO", 4, P.gold, P.brasa);
  return c;
}

// ------------------------------------------------------------- salida

mkdirSync(OUT, { recursive: true });
const write = (name: string, data: Buffer) => {
  writeFileSync(path.join(OUT, name), data);
  console.log(`${name}: ${(data.length / 1024).toFixed(0)} KiB`);
};
write("bienvenida.gif", encodeGif(welcome, PALETTE, SCALE, 14));
write("despedida.gif", encodeGif(farewell, PALETTE, SCALE, 16));
write("ofrenda.gif", encodeGif(boost, PALETTE, SCALE, 12));
write("runas.png", encodePng(rulesBanner(), PALETTE, SCALE));

// Vistas previas (primer fotograma) para revisar sin abrir los GIF.
const preview = process.env.ART_PREVIEW_DIR;
if (preview) {
  mkdirSync(preview, { recursive: true });
  for (const [name, f] of [["bienvenida", welcome], ["despedida", farewell], ["ofrenda", boost]] as const) {
    const first = f[0];
    if (first) writeFileSync(path.join(preview, `${name}.png`), encodePng(first, PALETTE, SCALE));
  }
}
