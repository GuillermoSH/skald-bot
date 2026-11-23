"""
Imágenes en pixel art de Skald (diseño propio), generadas con Pillow:

    pnpm art        (usa .venv: python3 -m venv .venv && .venv/bin/pip install -r scripts/art/requirements.txt)

Escribe en assets/: bienvenida.gif, despedida.gif, ofrenda.gif y runas.png.
Estilo del avatar y el banner: noche, luna de brasas, drakkar, cuervos, runas y ascuas.
Todo se dibuja a resolución de píxel (sin suavizado) y se escala ×SCALE con vecino más cercano.
Las animaciones son periódicas: el último fotograma enlaza con el primero.
"""

from __future__ import annotations

import math
import os
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[2] / "assets"
SCALE = 4
FRAMES = 16
W, H = 200, 75

# ----------------------------------------------------------------------------- paleta

PALETTE_HEX = {
    "sky0": "#07060c", "sky1": "#0d0a16", "sky2": "#160e1c", "sky3": "#22101a", "sky4": "#2f120f", "sky5": "#4a170d",
    "emberDark": "#5c1a0b", "brasa": "#a82814", "amber": "#d65218", "orange": "#e67a22", "gold": "#f2b35a",
    "light": "#ffe3a3", "warmWhite": "#fff6dc", "white": "#ffffff", "black": "#030203",
    "sea0": "#120a0c", "sea1": "#1e0f10", "seaGlow": "#3a130c",
    "star": "#c9c3d9", "starDim": "#6f6a85",
    "mtnFar": "#1b1822", "mtnMid": "#141119", "mtnNear": "#0c0a10", "snow": "#3a3546",
    "stone0": "#1f1e24", "stone1": "#2b2a30", "stone2": "#4a4850", "stone3": "#6e6b76", "stone4": "#8f8c98",
    "moss0": "#2f3a24", "moss1": "#4b5a32",
    "sailDark": "#6e140b", "wood0": "#2a1810", "wood1": "#3d2418", "wood2": "#5e3a22",
    "fog0": "#2e2838", "fog1": "#4a4058", "fog2": "#6b5f7d",
    "gem0": "#2a0b27", "gem1": "#5a1a4a", "gem2": "#8f2a78", "gem3": "#c94bb0", "gem4": "#ffb3f0",
    "aur0": "#2a0c18", "aur1": "#4d1424", "aur2": "#7a1f30", "aur3": "#a8323c",
}
NAMES = list(PALETTE_HEX)
C = {name: i for i, name in enumerate(NAMES)}


def palette_bytes() -> list[int]:
    flat: list[int] = []
    for name in NAMES:
        h = PALETTE_HEX[name].lstrip("#")
        flat += [int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)]
    return flat + [0] * (768 - len(flat))


PALETTE = palette_bytes()

BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


class Px:
    """Lienzo en modo paleta con utilidades de dibujo a nivel de píxel."""

    def __init__(self, w: int, h: int, fill: str = "sky0") -> None:
        self.img = Image.new("P", (w, h), C[fill])
        self.img.putpalette(PALETTE)
        self.d = ImageDraw.Draw(self.img)
        self.w, self.h = w, h

    def p(self, x: float, y: float, color: str) -> None:
        ix, iy = int(round(x)), int(round(y))
        if 0 <= ix < self.w and 0 <= iy < self.h:
            self.img.putpixel((ix, iy), C[color])

    def get(self, x: int, y: int) -> str:
        return NAMES[self.img.getpixel((x, y))]  # type: ignore[index]

    def rect(self, x0: float, y0: float, x1: float, y1: float, color: str) -> None:
        self.d.rectangle([int(x0), int(y0), int(x1), int(y1)], fill=C[color])

    def line(self, pts: list[tuple[float, float]], color: str) -> None:
        self.d.line([(int(round(x)), int(round(y))) for x, y in pts], fill=C[color], width=1)

    def poly(self, pts: list[tuple[float, float]], color: str) -> None:
        self.d.polygon([(int(round(x)), int(round(y))) for x, y in pts], fill=C[color])

    def disc(self, cx: float, cy: float, r: float, color: str) -> None:
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    self.p(x, y, color)

    def sprite(self, x: int, y: int, rows: list[str], colors: dict[str, str]) -> None:
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch in colors:
                    self.p(x + i, y + j, colors[ch])

    def dither(self, x: int, y: int, a: str, b: str, t: float) -> str:
        """Mezcla a→b con tramado ordenado (t en 0..1)."""
        return b if t * 16 > BAYER4[y % 4][x % 4] else a

    def export(self, scale: int = SCALE) -> Image.Image:
        return self.img.resize((self.w * scale, self.h * scale), Image.Resampling.NEAREST)


# ----------------------------------------------------------------------------- fuente 5×7 con contorno

GLYPHS = {
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "G": [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
    "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "N": ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "V": ["#...#", "#...#", "#...#", "#...#", ".#.#.", ".#.#.", "..#.."],
    ",": [".....", ".....", ".....", ".....", ".....", ".##..", ".#..."],
    "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
}


def text_width(text: str) -> int:
    return sum(4 if ch == " " else 6 for ch in text) - 1


def title(c: Px, text: str, y: int, fill: str = "gold", top: str = "light") -> None:
    """Título con contorno negro, sombra de brasa y degradado vertical (luz arriba)."""
    x0 = (c.w - text_width(text)) // 2
    on: set[tuple[int, int]] = set()
    x = x0
    for ch in text:
        if ch == " ":
            x += 4
            continue
        for j, row in enumerate(GLYPHS[ch]):
            for i, cell in enumerate(row):
                if cell == "#":
                    on.add((x + i, y + j))
        x += 6
    for px, py in on:  # sombra
        c.p(px + 1, py + 2, "brasa")
    for px, py in on:  # contorno
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if (px + dx, py + dy) not in on:
                    c.p(px + dx, py + dy, "black")
    for px, py in on:
        row = py - y
        c.p(px, py, top if row <= 1 else fill if row <= 4 else "orange")


# ----------------------------------------------------------------------------- runas (solo neutras)

# ᚠ fehu, ᚱ raido, ᚲ kaunan, ᚷ gebo, ᚹ wunjo, ᛗ mannaz. Nunca ᛟ ᛋ ᛉ ᛏ (usadas por extremistas).
RUNES = {
    "fehu": ["#..#.", "#.#.#", "##.#.", "#.#..", "##...", "#....", "#...."],
    "raido": ["###..", "#..#.", "#..#.", "###..", "#.#..", "#..#.", "#...#"],
    "kaunan": ["....#", "...#.", "..#..", ".#...", "..#..", "...#.", "....#"],
    "gebo": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    "wunjo": ["##...", "#.#..", "#..#.", "#.#..", "##...", "#....", "#...."],
    "mannaz": ["#...#", "##.##", "#.#.#", "##.##", "#...#", "#...#", "#...#"],
}
RUNE_ORDER = ["fehu", "raido", "kaunan", "gebo", "wunjo", "mannaz"]


# ----------------------------------------------------------------------------- escena: piezas

def sky(c: Px, horizon: int, warm: float = 1.0) -> None:
    bands = ["sky0", "sky1", "sky2", "sky3", "sky4", "sky5"]
    for y in range(horizon):
        t = (y / max(horizon - 1, 1)) ** (1.0 / warm) * (len(bands) - 1)
        i = min(int(t), len(bands) - 2)
        for x in range(c.w):
            c.p(x, y, c.dither(x, y, bands[i], bands[i + 1], t - i))


def stars(c: Px, horizon: int, frame: int, seed: int, count: int = 55) -> None:
    rnd = random.Random(seed)
    for i in range(count):
        x, y = rnd.randrange(c.w), rnd.randrange(int(horizon * 0.75))
        phase = (i * 5 + frame) % FRAMES
        bright = math.sin(phase / FRAMES * math.tau) > 0.3
        if i % 9 == 0:  # estrellas grandes con destello en cruz
            c.p(x, y, "white")
            if bright:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    c.p(x + dx, y + dy, "starDim")
        else:
            c.p(x, y, "star" if bright else "starDim")


def aurora(c: Px, frame: int, top: int = 10, strength: float = 1.0) -> None:
    ph = frame / FRAMES * math.tau
    colors = ["aur0", "aur1", "aur2", "aur3"]
    for x in range(c.w):
        y0 = top + 4 * math.sin(x * 0.045 + ph) + 2 * math.sin(x * 0.11 - ph * 2)
        length = 7 + 4 * math.sin(x * 0.07 + ph)
        intensity = (0.5 + 0.5 * math.sin(x * 0.03 - ph)) * strength
        for k in range(int(length)):
            t = (1 - k / length) * intensity
            if t <= 0.15 or (x + k) % 2:
                continue
            c.p(x, y0 + k, colors[min(3, int(t * 4))])


def moon(c: Px, cx: float, cy: float, r: float) -> None:
    for rr, col in ((r + 6, "sky4"), (r + 4, "sky5"), (r + 2, "emberDark")):
        for y in range(int(cy - rr), int(cy + rr + 1)):
            for x in range(int(cx - rr), int(cx + rr + 1)):
                d = math.hypot(x - cx, y - cy)
                if r < d <= rr and (x + y) % 2 == 0 or r < d <= rr - 1:
                    if d <= rr:
                        c.p(x, y, col)
    for y in range(int(cy - r), int(cy + r + 1)):
        for x in range(int(cx - r), int(cx + r + 1)):
            dx, dy = x - cx, y - cy
            if dx * dx + dy * dy > r * r:
                continue
            light = -(dx * 0.6 + dy * 0.8) / r  # luz desde arriba a la izquierda
            shade = "brasa" if light < -0.55 else "amber" if light < 0.1 else "orange" if light < 0.55 else "gold"
            if light > 0.8 and (x + y) % 2 == 0:
                shade = "light"
            c.p(x, y, shade)
    for dx, dy, s in ((0.35, 0.2, 0.18), (-0.4, 0.45, 0.1), (0.1, -0.45, 0.08), (0.55, -0.15, 0.07), (-0.2, 0.0, 0.06)):
        x, y, rr = cx + dx * r, cy + dy * r, max(1.0, s * r)
        c.disc(x, y, rr, "brasa")
        c.disc(x - 0.6, y - 0.6, max(0.6, rr - 1), "amber")


def mountains(c: Px, horizon: int, seed: int, color: str, height: float, rough: float, xs: tuple[int, int], snow: bool = False) -> None:
    rnd = random.Random(seed)
    pts: list[float] = []
    level = height * 0.5
    for _ in range(c.w + 1):
        level = max(2.0, min(height, level + rnd.uniform(-rough, rough)))
        pts.append(level)
    for x in range(xs[0], xs[1]):
        # Atenúa en los extremos del rango para que no corte en seco.
        edge = min(1.0, (x - xs[0]) / 12, (xs[1] - x) / 12)
        top = horizon - pts[x] * edge
        for y in range(int(top), horizon):
            c.p(x, y, color)
        if snow and pts[x] * edge > height * 0.75:
            c.p(x, int(top), "snow")


def sea(c: Px, horizon: int, frame: int, glow_x: float, glow_w: float) -> None:
    ph = frame / FRAMES * math.tau
    for y in range(horizon, c.h):
        t = (y - horizon) / max(c.h - horizon, 1)
        for x in range(c.w):
            c.p(x, y, c.dither(x, y, "sea1", "sea0", t * 1.4))
    for x in range(c.w):
        c.p(x, horizon, "seaGlow")
    # Crestas de ola que avanzan.
    rnd = random.Random(99)
    for _ in range(70):
        x0, y = rnd.uniform(0, c.w), rnd.randrange(horizon + 2, c.h)
        x = (x0 + frame * (1 + (y - horizon) * 0.08)) % c.w
        for k in range(2 + (y - horizon) // 6):
            c.p(x + k, y, "seaGlow")
    # Reflejo de la luna que tiembla.
    for y in range(horizon + 1, c.h, 1):
        depth = (y - horizon) / (c.h - horizon)
        half = glow_w / 2 * (0.6 + depth * 0.7)
        wobble = 2 * math.sin(y * 0.9 + ph * 2)
        for x in range(int(glow_x - half), int(glow_x + half)):
            n = (x * 7 + y * 13 + frame * 3) % 11
            if n < 4 or (y % 2 and n < 7):
                continue
            col = "gold" if n == 10 and depth < 0.5 else "orange" if n > 8 else "amber" if depth < 0.6 else "brasa"
            c.p(x + wobble, y, col)


def drakkar(c: Px, x: float, wl: float, frame: int, s: float = 1.0) -> None:
    """Drakkar mirando a la derecha. (x, wl) = popa y línea de flotación."""
    ph = frame / FRAMES * math.tau
    L = 64 * s
    hull_top: list[float] = []
    # Casco: tablones de madera con borde negro.
    for i in range(int(L) + 1):
        t = i / L
        lift = 9 * s * abs(2 * t - 1) ** 3
        top = wl - 7 * s - lift
        bottom = wl + 1 - lift * 0.35
        hull_top.append(top)
        for y in range(int(top), int(bottom) + 1):
            row = y - int(top)
            col = "black" if y in (int(top), int(bottom)) else "wood2" if row % 3 == 1 else "wood1" if row % 3 == 2 else "wood0"
            c.p(x + i, y, col)
        c.p(x + i, top - 1, "black")
    # Remos que reman.
    for k, i in enumerate(range(int(8 * s), int(L - 10 * s), max(4, int(7 * s)))):
        stroke = math.sin(ph + k * 0.3)
        x0, y0 = x + i, hull_top[min(i, len(hull_top) - 1)] + 3 * s
        c.line([(x0, y0), (x0 - 6 * s + stroke * 3 * s, wl + 5 * s)], "wood2")
        c.p(x0 - 6 * s + stroke * 3 * s, wl + 5 * s, "seaGlow")
    # Escudos con umbo.
    for k, i in enumerate(range(int(6 * s), int(L - 6 * s), max(4, int(6 * s)))):
        sx, sy = x + i, hull_top[min(i, len(hull_top) - 1)] + 2 * s
        face = ("brasa", "gold", "amber")[k % 3]
        c.disc(sx, sy, 2.2 * s, "black")
        c.disc(sx, sy, 1.6 * s, face)
        c.p(sx, sy, "light" if s >= 1 else face)
    # Proa: cuello y cabeza de dragón.
    px0, py0 = x + L, hull_top[-1]
    neck = [(px0 + 2 * s * math.sin(t * 1.2), py0 - 14 * s * t) for t in (i / 10 for i in range(11))]
    for nx, ny in neck:
        c.disc(nx, ny, 1.4 * s, "black")
    hx, hy = neck[-1]
    if s >= 0.9:
        c.sprite(int(hx) - 3, int(hy) - 4,
                 ["..##....", ".####...", "######..", "##*####.", "#######>", ".##.....", ".#......"],
                 {"#": "black", ">": "black", "*": "orange"})
    else:
        c.disc(hx + 1, hy - 1, 2 * s, "black")
    # Popa: cola enroscada.
    sx0, sy0 = x, hull_top[0]
    for t in (i / 12 for i in range(13)):
        a = t * math.pi * 1.3
        c.disc(sx0 - 3 * s * math.sin(a), sy0 - 11 * s * t, 1.2 * s, "black")
    # Mástil, jarcias, verga y vela con cuervo.
    mx = x + L * 0.5
    top = wl - 40 * s
    c.line([(mx, wl - 6 * s), (mx, top)], "black")
    c.line([(mx, top), (x + L - 2, hull_top[-1])], "black")
    c.line([(mx, top), (x + 3, hull_top[0])], "black")
    sw, sh = 30 * s, 20 * s
    sail_top = top + 4 * s
    billow = 2.5 * s + 0.8 * s * math.sin(ph)
    c.line([(mx - sw / 2 - 2, sail_top - 1), (mx + sw / 2 + 2, sail_top - 1)], "wood0")
    stripe = max(2, int(4 * s))
    for j in range(int(sh)):
        b = billow * math.sin(j / sh * math.pi)
        for i in range(int(-sw / 2 - b), int(sw / 2 + b) + 1):
            col = "brasa" if ((i + 100) // stripe) % 2 == 0 else "sailDark"
            if j == int(sh) - 1 or i in (int(-sw / 2 - b), int(sw / 2 + b)):
                col = "black"
            c.p(mx + i, sail_top + j, col)
    if s >= 0.9:  # cuervo pintado en la vela
        c.sprite(int(mx) - 6, int(sail_top + sh / 2) - 3,
                 ["....###....", "...#####...", "#.#######.#", "###########", ".#########.", "...##.##..."],
                 {"#": "black"})


RAVEN = [
    [".#.......#.", "..#.....#..", "...##.##...", "....###....", "....#.#>..."],  # alas arriba
    ["...........", "##.......##", "..###.###..", "....###....", "....#.#>..."],  # planeando
    ["...........", "...........", "...##.##...", "..#.###.#..", ".#..#.#>.#."],  # alas abajo
]


def raven(c: Px, x: float, y: float, frame: int, color: str = "black") -> None:
    c.sprite(int(x) - 5, int(y) - 2, RAVEN[(frame // 2) % 3], {"#": color, ">": "orange"})


def embers(c: Px, frame: int, seed: int, count: int) -> None:
    rnd = random.Random(seed)
    for i in range(count):
        x0, y0 = rnd.uniform(0, c.w), rnd.uniform(0, c.h)
        speed = rnd.choice((1, 2, 3))
        y = (y0 - frame * speed * c.h / FRAMES / 2) % c.h
        x = x0 + 2 * math.sin(frame / FRAMES * math.tau * speed + i)
        c.p(x, y, "gold" if i % 3 == 0 else "orange")
        c.p(x, y + 1, "brasa" if i % 2 == 0 else "emberDark")


def fog(c: Px, y: float, frame: int, color: str, thickness: int, speed: int, seed: int) -> None:
    ph = frame / FRAMES * math.tau
    rnd = random.Random(seed)
    offsets = [rnd.uniform(0, math.tau) for _ in range(3)]
    for x in range(c.w):
        wave = 2 * math.sin(x * 0.06 + ph * speed + offsets[0]) + math.sin(x * 0.15 - ph * speed + offsets[1])
        density = 0.5 + 0.5 * math.sin(x * 0.04 + ph * speed + offsets[2])
        for k in range(thickness):
            t = density * (1 - abs(k - thickness / 2) / (thickness / 2))
            if t > BAYER4[int(y + k) % 4][x % 4] / 16:
                c.p(x, y + wave + k, color)


def frames(draw, w: int = W, h: int = H) -> list[Image.Image]:
    out = []
    for f in range(FRAMES):
        c = Px(w, h)
        draw(c, f)
        out.append(c.export())
    return out


# ----------------------------------------------------------------------------- escenas

def welcome(c: Px, f: int) -> None:
    horizon = 54
    ph = f / FRAMES * math.tau
    sky(c, horizon)
    aurora(c, f, top=12)
    stars(c, horizon, f, seed=7)
    moon(c, 152, 34, 19)
    mountains(c, horizon, seed=3, color="mtnFar", height=20, rough=2.2, xs=(0, 110), snow=True)
    mountains(c, horizon, seed=4, color="mtnMid", height=12, rough=2.5, xs=(0, 75))
    mountains(c, horizon, seed=5, color="mtnNear", height=7, rough=1.8, xs=(178, 200))
    sea(c, horizon, f, 152, 34)
    drakkar(c, 40, 61 + round(math.sin(ph)), f)
    raven(c, 112 + 18 * math.cos(ph), 30 + 6 * math.sin(ph), f)
    raven(c, 60 + 14 * math.cos(ph + 2.5), 22 + 4 * math.sin(ph + 2.5), f + 3)
    embers(c, f, seed=11, count=26)
    title(c, "BIENVENIDO AL REINO", 3)


def farewell(c: Px, f: int) -> None:
    horizon = 50
    ph = f / FRAMES * math.tau
    sky(c, horizon, warm=1.4)
    aurora(c, f, top=8, strength=0.6)
    stars(c, horizon, f, seed=21)
    moon(c, 46, 50, 25)
    mountains(c, horizon, seed=8, color="mtnFar", height=14, rough=2.0, xs=(90, 200), snow=True)
    sea(c, horizon, f, 46, 46)
    drakkar(c, 128, 56 + round(math.sin(ph) * 0.6), f, s=0.55)
    fog(c, 50, f, "fog0", 6, 1, seed=1)
    fog(c, 58, f, "fog1", 5, 2, seed=2)
    fog(c, 67, f, "fog0", 6, 1, seed=3)
    raven(c, 112 + 10 * math.cos(ph), 30 + 3 * math.sin(ph * 2), f)
    embers(c, f, seed=17, count=12)
    title(c, "BUEN VIAJE, GUERRERO", 3)


def offering(c: Px, f: int) -> None:
    ph = f / FRAMES * math.tau
    sky(c, H, warm=0.7)
    aurora(c, f, top=14, strength=1.2)
    stars(c, H, f, seed=33, count=70)
    cx, cy = W / 2, 44
    # Anillo de runas que laten.
    for k in range(12):
        a = k / 12 * math.tau - math.pi / 2
        rx, ry = cx + 34 * math.cos(a), cy + 22 * math.sin(a)
        lit = (k + f // 2) % 6 == 0
        glyph = RUNES[RUNE_ORDER[k % len(RUNE_ORDER)]]
        c.sprite(int(rx) - 2, int(ry) - 3, glyph, {"#": "emberDark"})
        c.sprite(int(rx) - 3, int(ry) - 4, glyph, {"#": "gold" if lit else "amber"})
    # Halo
    c.disc(cx, cy, 18, "sky3")
    c.disc(cx, cy, 15, "emberDark")
    # Gema tallada (octógono con facetas) y brillo que la recorre.
    top, mid, bottom, half = cy - 14, cy - 4, cy + 14, 12
    facets = [
        ([(cx - half, mid), (cx - 6, top), (cx, mid)], "gem3"),
        ([(cx, mid), (cx - 6, top), (cx + 6, top)], "gem4"),
        ([(cx, mid), (cx + 6, top), (cx + half, mid)], "gem2"),
        ([(cx - half, mid), (cx, mid), (cx, bottom)], "gem2"),
        ([(cx, mid), (cx + half, mid), (cx, bottom)], "gem1"),
    ]
    for pts, col in facets:
        c.poly(pts, col)
    c.line([(cx - half, mid), (cx + half, mid)], "gem4")
    c.line([(cx - half, mid), (cx, bottom), (cx + half, mid)], "gem0")
    sweep = -16 + (f / FRAMES) * 48
    for y in range(int(top), int(bottom) + 1):
        for x in range(int(cx - half), int(cx + half) + 1):
            if c.get(x, y).startswith("gem") and abs((x - cx) + (y - cy) * 0.6 - sweep) < 1.5:
                c.p(x, y, "white")
    # Destellos que orbitan.
    for k in range(5):
        a = ph + k * math.tau / 5
        sx, sy = cx + 24 * math.cos(a), cy + 12 * math.sin(a)
        big = (f + k) % 4 < 2
        c.p(sx, sy, "white")
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            c.p(sx + dx, sy + dy, "gem4" if big else "gold")
        if big:
            for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2)):
                c.p(sx + dx, sy + dy, "gem3")
    embers(c, f, seed=5, count=20)
    title(c, "OFRENDA AL REINO", 3)


def rules_banner() -> Image.Image:
    c = Px(W, 56)
    horizon = 50
    sky(c, horizon)
    aurora(c, 3, top=12, strength=0.7)
    stars(c, horizon, 2, seed=51)
    mountains(c, horizon, seed=12, color="mtnFar", height=16, rough=2.2, xs=(0, 200), snow=True)
    c.rect(0, horizon, W, 56, "mtnNear")
    # Piedra rúnica con textura, grietas y musgo.
    rnd = random.Random(77)
    x0, x1, y0, y1 = 40, 160, 17, 52
    for y in range(y0, y1):
        inset = max(0, (y0 + 4 - y)) * 2
        for x in range(x0 + inset, x1 - inset):
            n = rnd.random()
            col = "stone3" if n < 0.12 else "stone2" if n < 0.72 else "stone1"
            if x in (x0 + inset, x1 - inset - 1) or y == y1 - 1:
                col = "stone0"
            elif y == y0 or (y == y0 + 1 and n < 0.5):
                col = "stone4"
            c.p(x, y, col)
    for cx0, cy0 in ((52, 20), (138, 24), (96, 46)):  # grietas
        x, y = cx0, cy0
        for _ in range(9):
            c.p(x, y, "stone0")
            x += rnd.choice((-1, 0, 1))
            y += 1
    for x in range(x0 + 2, x1 - 2):  # musgo en lo alto
        if rnd.random() < 0.35:
            c.p(x, y0 + (0 if rnd.random() < 0.6 else 1), "moss1" if rnd.random() < 0.5 else "moss0")
    # Runas talladas con brillo de brasa.
    for k, name in enumerate(RUNE_ORDER * 2):
        glyph = RUNES[name]
        gx, gy = 50 + k * 9, 30
        halo = {(gx + i + dx, gy + j + dy) for j, row in enumerate(glyph) for i, ch in enumerate(row) if ch == "#"
                for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
        for hx, hy in halo:
            c.p(hx, hy, "stone1")
        c.sprite(gx + 1, gy + 1, glyph, {"#": "stone0"})
        c.sprite(gx, gy, glyph, {"#": "orange" if k % 2 else "amber"})
    # Antorchas a los lados.
    for tx in (28, 171):
        c.rect(tx, 30, tx + 1, 52, "wood1")
        c.rect(tx - 1, 28, tx + 2, 30, "wood0")
        c.sprite(tx - 2, 18, ["..#...", ".###..", ".#*#..", "##*##.", "#*o*#.", ".#*#..", "..#..."],
                 {"#": "brasa", "*": "orange", "o": "light"})
    embers(c, 4, seed=9, count=14)
    title(c, "LAS RUNAS DEL REINO", 3)
    return c.export()


# ----------------------------------------------------------------------------- salida

def save_gif(name: str, imgs: list[Image.Image], ms: int) -> None:
    path = OUT / name
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=ms, loop=0, disposal=1, optimize=False)
    print(f"{name}: {path.stat().st_size // 1024} KiB, {len(imgs)} fotogramas, {imgs[0].width}x{imgs[0].height}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    welcome_frames = frames(welcome)
    farewell_frames = frames(farewell)
    offering_frames = frames(offering)
    save_gif("bienvenida.gif", welcome_frames, 100)
    save_gif("despedida.gif", farewell_frames, 120)
    save_gif("ofrenda.gif", offering_frames, 90)
    banner = rules_banner()
    banner.save(OUT / "runas.png", optimize=True)
    print(f"runas.png: {(OUT / 'runas.png').stat().st_size // 1024} KiB, {banner.width}x{banner.height}")

    preview = os.environ.get("ART_PREVIEW_DIR")
    if preview:  # primer fotograma de cada GIF, para revisarlos rápido
        Path(preview).mkdir(parents=True, exist_ok=True)
        for name, imgs in (("bienvenida", welcome_frames), ("despedida", farewell_frames), ("ofrenda", offering_frames)):
            imgs[0].convert("RGB").save(Path(preview) / f"{name}.png")
            imgs[FRAMES // 2].convert("RGB").save(Path(preview) / f"{name}-mitad.png")


if __name__ == "__main__":
    sys.exit(main())
