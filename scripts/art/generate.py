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
    # Plata (monedas) y verde de tierra nueva (cambio de era).
    "silver0": "#3b3a45", "silver1": "#5f5e6d", "silver2": "#8e8c9c", "silver3": "#bdbbc9", "silver4": "#e6e4ef",
    "land0": "#1a2416", "land1": "#2c3b22", "land2": "#46592f",
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
    "C": [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "G": [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
    "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    "N": ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
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


def coin(c: Px, cx: float, cy: float, r: float, angle: float) -> None:
    """Moneda de plata girando sobre su eje vertical: ᚠ (fehu, «riqueza») por delante, ᚱ por detrás."""
    ca, sa = math.cos(angle), math.sin(angle)
    w = max(0.8, r * abs(ca))
    edge = r * 0.22 * abs(sa)  # canto visible al girar
    shift = edge if sa > 0 else -edge
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - edge - 2), int(cx + r + edge + 3)):
            dy = (y - cy) / r
            # Canto: la misma elipse desplazada, más oscura y con estrías.
            if ((x - cx - shift) / w) ** 2 + dy * dy <= 1:
                c.p(x, y, "silver0" if y % 2 else "silver1")
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - w - 1), int(cx + w + 2)):
            dx, dy = (x - cx) / w, (y - cy) / r
            d = dx * dx + dy * dy
            if d > 1:
                continue
            light = -(dx * 0.5 + dy * 0.8)
            col = "silver1" if light < -0.5 else "silver2" if light < 0.15 else "silver3" if light < 0.6 else "silver4"
            if d > 0.78:  # reborde
                col = "silver1" if light < 0 else "silver3"
            if d > 0.93:
                col = "black"
            c.p(x, y, col)
    # Runa grabada (se estrecha con el giro).
    if abs(ca) > 0.35:
        glyph = RUNES["fehu" if ca > 0 else "raido"]
        k = 2  # cada píxel de la runa, 2×2 (en horizontal se estrecha con el giro)
        cols = max(1, round(k * abs(ca)))
        for j, row in enumerate(glyph):
            for i, ch in enumerate(row):
                if ch != "#":
                    continue
                col_i = i if ca > 0 else 4 - i  # por detrás se ve al revés
                gx = round(cx + (col_i - 2.5) * k * abs(ca))
                gy = round(cy + (j - 3.5) * k)
                for sy in range(k):
                    for sx in range(cols):
                        c.p(gx + sx + 1, gy + sy + 1, "silver4")
                for sy in range(k):
                    for sx in range(cols):
                        c.p(gx + sx, gy + sy, "silver0")
    # Destello que recorre la cara.
    if ca > 0.6:
        c.p(cx - w * 0.45, cy - r * 0.45, "white")
        c.p(cx - w * 0.45 + 1, cy - r * 0.45, "silver4")


def treasure(c: Px, f: int) -> None:
    ph = f / FRAMES * math.tau
    floor = 60
    sky(c, floor, warm=0.8)
    aurora(c, f, top=16, strength=0.8)
    stars(c, floor, f, seed=61, count=45)
    # Suelo de piedra del salón.
    rnd = random.Random(3)
    for y in range(floor, H):
        for x in range(W):
            n = rnd.random()
            c.p(x, y, "stone0" if n < 0.55 else "stone1" if n < 0.9 else "stone2")
    for x in range(W):
        c.p(x, floor, "stone2")
    cx = W / 2
    # Resplandor del cofre.
    for y in range(18, floor):
        t = 1 - (floor - y) / (floor - 18)
        half = 12 + (floor - y) * 0.55
        for x in range(int(cx - half), int(cx + half)):
            if t * 0.7 > BAYER4[y % 4][x % 4] / 16 + abs(x - cx) / half * 0.5:
                c.p(x, y, "sky5" if t < 0.6 else "emberDark")
    # Montones de monedas a los lados: filas de monedas de canto, cada vez más estrechas.
    for side in (-1, 1):
        mx0 = cx + side * 36
        for row in range(5):
            half = 13 - row * 2.5
            y = floor - 1 - row * 2
            for k in range(int(-half), int(half) + 1, 3):
                x = mx0 + k + (row % 2) * 1.5
                c.rect(x - 1, y - 1, x + 1, y, "silver1")
                c.p(x - 1, y - 1, "silver3")
                c.p(x, y - 1, "silver4" if (k + row) % 4 == 0 else "silver2")
                c.p(x - 1, y, "silver0")
    # Cofre abierto: tapa, caja, flejes dorados y monedas dentro.
    x0, x1, top, bottom = cx - 20, cx + 20, 44, floor + 1
    c.poly([(x0 + 2, top - 1), (x1 - 2, top - 1), (x1 - 5, top - 12), (x0 + 5, top - 12)], "wood0")
    c.line([(x0 + 5, top - 12), (x1 - 5, top - 12)], "gold")
    c.line([(cx, top - 12), (cx, top - 1)], "amber")
    for y in range(top, bottom):
        for x in range(int(x0), int(x1) + 1):
            col = "wood2" if (y - top) % 4 == 1 else "wood1"
            if x in (int(x0), int(x1)) or y == bottom - 1:
                col = "black"
            c.p(x, y, col)
    for bx in (x0 + 6, x1 - 6):
        c.rect(bx, top, bx + 1, bottom - 2, "gold")
    c.rect(x0 + 1, top + 5, x1 - 1, top + 5, "amber")
    c.rect(cx - 2, top + 3, cx + 2, top + 7, "gold")
    c.p(cx, top + 5, "black")
    for k in range(18):  # monedas que asoman
        c.disc(x0 + 4 + k * 2, top - 1 - (k % 3 == 0), 1.5, "silver2" if k % 2 else "silver3")
    # Moneda que gira y flota.
    coin(c, cx, 26 + 2 * math.sin(ph), 11, ph)
    # Destellos.
    for k in range(6):
        a = ph * 0.5 + k * math.tau / 6
        sx, sy = cx + 30 * math.cos(a), 30 + 10 * math.sin(a)
        if (f + k) % 4 < 2:
            c.p(sx, sy, "white")
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                c.p(sx + dx, sy + dy, "silver3")
    embers(c, f, seed=29, count=10)
    title(c, "EL TESORO DEL REINO", 3)


ERA_W, ERA_H = 240, 60


def new_era(c: Px, f: int) -> None:
    """El drakkar deja atrás el mundo viejo en llamas y va hacia el amanecer de uno nuevo."""
    ph = f / FRAMES * math.tau
    horizon = 44
    sky(c, horizon, warm=1.2)
    stars(c, horizon, f, seed=71, count=40)
    aurora(c, f, top=12, strength=0.5)
    # Amanecer a la derecha.
    moon(c, 205, horizon + 3, 15)
    mountains(c, horizon, seed=31, color="land0", height=11, rough=1.6, xs=(150, 240))
    mountains(c, horizon, seed=32, color="land1", height=6, rough=1.2, xs=(175, 240))
    for x in range(180, 240):  # luz sobre la tierra nueva
        for y in range(horizon - 6, horizon):
            if c.get(x, y) == "land1" and (x + y + f) % 5 == 0:
                c.p(x, y, "land2")
    # Mundo viejo ardiendo a la izquierda.
    mountains(c, horizon, seed=33, color="mtnFar", height=16, rough=2.4, xs=(0, 95))
    rnd = random.Random(5)
    for k in range(40):
        fx = rnd.uniform(4, 90)
        base = horizon - rnd.uniform(0, 9)
        height = 3 + 3 * abs(math.sin(ph * 2 + k))
        for j in range(int(height)):
            col = "brasa" if j < 1 else "amber" if j < 3 else "orange" if j < 4 else "gold"
            c.p(fx + math.sin(ph + k + j) * 0.8, base - j, col)
    sea(c, horizon, f, 205, 16)
    drakkar(c, 98, 49 + round(math.sin(ph) * 0.8), f, s=0.6)
    raven(c, 150 + 12 * math.cos(ph), 20 + 4 * math.sin(ph), f)
    raven(c, 124 + 10 * math.cos(ph + 2), 14 + 3 * math.sin(ph + 2), f + 2)
    embers(c, f, seed=41, count=18)
    title(c, "NACE UNA NUEVA ERA", 3)


HORN_W, HORN_H = 200, 80

HORNBLOWER = [  # guerrero de perfil (mirando a la derecha) tocando el cuerno
    "....##......",
    "...####.....",
    "..######....",
    "..#####.....",
    "...###......",
    "..#####.....",
    ".#######....",
    "##.#####....",
    "#..#####....",
    "...#####....",
    "...##.##....",
    "...##.##....",
    "..###.###...",
]


def horn_call(c: Px, f: int) -> None:
    """Un guerrero en lo alto de un risco hace sonar el cuerno; las ondas recorren el valle."""
    ph = f / FRAMES * math.tau
    horizon = 62
    sky(c, horizon, warm=1.1)
    aurora(c, f, top=14, strength=0.9)
    stars(c, horizon, f, seed=81, count=50)
    moon(c, 160, 30, 13)
    mountains(c, horizon, seed=41, color="mtnFar", height=18, rough=2.2, xs=(60, 200), snow=True)
    mountains(c, horizon, seed=42, color="mtnMid", height=10, rough=2.0, xs=(90, 200))
    c.rect(0, horizon, c.w, c.h, "mtnNear")
    # Risco a la izquierda.
    for x in range(0, 62):
        top = 44 + (x / 62) ** 2 * 22 + math.sin(x * 0.7) * 1.2
        for y in range(int(top), c.h):
            c.p(x, y, "mtnNear" if y > top + 1 else "stone1")
    # Guerrero (a doble tamaño) y cuerno curvo con boquilla dorada.
    k2 = 2
    gx, gy = 26, 45 - len(HORNBLOWER) * k2
    for j, row in enumerate(HORNBLOWER):
        for i, ch in enumerate(row):
            if ch == "#":
                c.rect(gx + i * k2, gy + j * k2, gx + i * k2 + k2 - 1, gy + j * k2 + k2 - 1, "black")
    # Capa que ondea.
    for j in range(8):
        sway = round(math.sin(ph * 2 + j * 0.5))
        c.p(gx + 1 + sway - j * 0.3, gy + 12 + j * 1.5, "sailDark")
        c.p(gx + 2 + sway - j * 0.3, gy + 12 + j * 1.5, "brasa")
    horn = [(gx + 14 + k * 1.6, gy + 6 - k * 0.9 + (k / 8) ** 2 * 3) for k in range(10)]
    for k, (hx, hy) in enumerate(horn):
        c.disc(hx, hy, 0.8 + k * 0.28, "black")
    for k, (hx, hy) in enumerate(horn):
        c.disc(hx, hy, 0.4 + k * 0.22, "gold" if k in (0, 4, 8) else "wood2")
    c.p(horn[-1][0] + 2, horn[-1][1], "light")
    # Ondas del cuerno que se alejan (arcos que crecen y se apagan).
    ox, oy = horn[-1]
    for wave in range(3):
        t = ((f / FRAMES) + wave / 3) % 1
        r = 6 + t * 70
        col = "gold" if t < 0.3 else "orange" if t < 0.6 else "brasa"
        for a in range(-50, 51, 2):
            ang = math.radians(a)
            if (a // 2 + wave) % 3 == 0:
                continue
            c.p(ox + r * math.cos(ang), oy - r * math.sin(ang) * 0.7, col)
    raven(c, 120 + 10 * math.cos(ph), 24 + 3 * math.sin(ph), f)
    raven(c, 96 + 8 * math.cos(ph + 2), 16 + 3 * math.sin(ph + 2), f + 3)
    embers(c, f, seed=19, count=14)
    title(c, "SUENA EL CUERNO", 3)


CLOCK = 64


def hourglass(c: Px, f: int) -> None:
    """Reloj de arena con marco tallado: la arena cae y el de abajo se llena."""
    t = f / FRAMES
    cx = CLOCK / 2
    # Fondo: halo cálido y anillo de runas.
    for y in range(CLOCK):
        for x in range(CLOCK):
            d = math.hypot(x - cx, y - cx)
            if d < 30:
                c.p(x, y, c.dither(x, y, "sky4", "sky1", d / 30))
    for k in range(6):
        a = k / 6 * math.tau + math.pi / 6
        glyph = RUNES[RUNE_ORDER[k]]
        lit = (k + f // 3) % 6 == 0
        c.sprite(int(cx + 26 * math.cos(a)) - 2, int(cx + 26 * math.sin(a)) - 3, glyph, {"#": "gold" if lit else "emberDark"})
    top, bottom, half_w = 12, 52, 12
    # Cristal: dos conos unidos por el cuello.
    def width_at(y: int) -> float:
        mid = (top + bottom) / 2
        return 1.2 + (half_w - 1.2) * (abs(y - mid) / ((bottom - top) / 2)) ** 1.4

    sand_top_level = top + 3 + t * 15  # la arena de arriba baja
    sand_bottom_level = bottom - 3 - t * 14  # la de abajo sube (en montón)
    for y in range(top + 2, bottom - 1):
        w = width_at(y)
        for x in range(int(cx - w), int(cx + w) + 1):
            edge = x in (int(cx - w), int(cx + w))
            col = "fog1" if edge else "sky2"
            upper = y < (top + bottom) / 2
            if upper and y >= sand_top_level:
                col = "gold" if (x + y) % 3 else "orange"
            if not upper:
                heap = sand_bottom_level + abs(x - cx) * 0.6
                if y >= heap:
                    col = "gold" if (x + y) % 3 else "amber"
            if edge:
                col = "fog2" if x < cx else "fog1"
            c.p(x, y, col)
    # Hilo de arena que cae (con granos que bajan).
    mid = (top + bottom) // 2
    for y in range(mid, int(sand_bottom_level)):
        if (y + f) % 2 == 0:
            c.p(cx, y, "light")
    # Brillo del cristal.
    for y in range(top + 4, mid - 4):
        c.p(cx - width_at(y) + 2, y, "fog2")
    # Marco de madera con tapas y columnas.
    for y0 in (top - 1, bottom - 2):
        c.rect(cx - half_w - 4, y0, cx + half_w + 4, y0 + 2, "wood1")
        c.rect(cx - half_w - 4, y0, cx + half_w + 4, y0, "wood2")
        c.p(cx - half_w - 4, y0 + 2, "black")
    for px in (cx - half_w - 3, cx + half_w + 3):
        c.rect(px - 1, top + 2, px, bottom - 3, "wood0")
        c.p(px - 1, mid, "gold")


PANEL_W, PANEL_H = 200, 64


def panel_banner(state: str) -> Image.Image:
    """Torre-almenara del reino: el fuego dice cómo está el servidor (ok, empty, lag, down)."""
    c = Px(PANEL_W, PANEL_H)
    horizon = 58
    sky(c, horizon, warm={"ok": 1.3, "empty": 0.6, "lag": 1.8, "down": 0.3}[state])
    if state != "lag":
        stars(c, horizon, 3, seed=91, count=45 if state != "ok" else 25)
    aurora(c, 5, top=12, strength={"ok": 0.7, "empty": 0.4, "lag": 1.4, "down": 0.0}[state])
    if state in ("empty", "down"):
        moon(c, 168, 30, 9)
    mountains(c, horizon, seed=52, color="mtnFar", height=13, rough=2.0, xs=(0, 200), snow=True)
    c.rect(0, horizon, c.w, c.h, "mtnNear")
    cx = 100
    for x in range(56, 145):  # colina
        top = horizon - 7 * math.cos((x - cx) / 44 * math.pi / 2)
        for y in range(int(top), c.h):
            c.p(x, y, "mtnNear")
    rnd = random.Random(8)
    tower_top = 34
    for y in range(tower_top, horizon - 4):
        half = 6 + (y - tower_top) * 0.12
        for x in range(int(cx - half), int(cx + half) + 1):
            n = rnd.random()
            col = "stone2" if n < 0.6 else "stone1" if n < 0.9 else "stone3"
            if (y - tower_top) % 4 == 0 and n < 0.7:
                col = "stone0"
            if x in (int(cx - half), int(cx + half)):
                col = "stone0"
            c.p(x, y, col)
    for k in range(-6, 7, 3):  # almenas
        c.rect(cx + k - 1, tower_top - 3, cx + k, tower_top - 1, "stone2")
    c.rect(cx - 1, 42, cx + 1, 46, "black")  # tronera
    if state != "down":
        c.p(cx, 44, "gold" if state == "ok" else "amber" if state == "lag" else "emberDark")
    # Fuego de la almenara (sobre la torre, por debajo del título).
    base = tower_top - 3
    size = {"ok": 13, "empty": 5, "lag": 10, "down": 0}[state]
    for k in range(-7, 8):
        h = size * (1 - abs(k) / 8) * (0.75 + 0.45 * abs(math.sin(k * 1.7)))
        for j in range(int(h)):
            col = "brasa" if j < 1 else "amber" if j < h * 0.4 else "orange" if j < h * 0.75 else "gold"
            if state == "lag" and j > h * 0.55:
                col = "brasa" if (k + j) % 2 else "amber"
            if state == "ok" and j > h * 0.85:
                col = "light"
            c.p(cx + k, base - j, col)
    if state == "ok":  # resplandor alrededor del fuego
        for a in range(0, 360, 20):
            r = 15 + (a % 40) / 10
            c.p(cx + r * math.cos(math.radians(a)), base - 6 + r * 0.6 * math.sin(math.radians(a)), "gold" if a % 40 else "orange")
    if state in ("lag", "down"):  # humo
        for k in range(22):
            x = cx + 2 + k * 1.1 + math.sin(k * 0.8) * 2
            y = base - 2 - k * 0.8
            c.p(x, y, "fog1" if k % 2 else "fog2")
            c.p(x + 1, y, "fog0")
    if state == "lag":
        embers(c, 6, seed=13, count=18)
    elif state == "ok":
        embers(c, 2, seed=14, count=10)
    title(c, "ESTADO DEL REINO", 3)
    return c.export()


WARRIOR = [  # guerrero de espaldas, espada en alto
    "......#.....",
    "......#.....",
    "......#.....",
    "...##.#.....",
    "..####*.....",
    "..####......",
    ".######.....",
    "########....",
    "########....",
    ".######.....",
    ".##..##.....",
    ".##..##.....",
    "##....##....",
]


def einherjar(c: Px, f: int) -> None:
    """Un guerrero llega a las puertas abiertas del salón del Valhalla."""
    ph = f / FRAMES * math.tau
    horizon = 58
    sky(c, horizon, warm=0.9)
    aurora(c, f, top=10, strength=1.0)
    stars(c, horizon, f, seed=101, count=50)
    mountains(c, horizon, seed=61, color="mtnFar", height=14, rough=2.0, xs=(0, 200), snow=True)
    c.rect(0, horizon, c.w, c.h, "mtnNear")
    cx = 100
    # Salón: muros de madera, tejado a dos aguas con cabezas de dragón cruzadas.
    left, right, wall_top = 52, 148, 36
    for y in range(wall_top, horizon + 1):
        for x in range(left, right + 1):
            col = "wood1" if (x // 4) % 2 else "wood0"
            if y in (wall_top, horizon) or x in (left, right):
                col = "black"
            c.p(x, y, col)
    for y in range(18, wall_top + 1):  # tejado
        half = (y - 18) * 3 + 4
        for x in range(int(cx - half), int(cx + half) + 1):
            if left - 6 <= x <= right + 6:
                c.p(x, y, "wood0" if (x + y) % 3 else "black")
    c.line([(left - 6, wall_top), (cx, 17), (right + 6, wall_top)], "black")
    for side in (-1, 1):  # cabezas de dragón en el caballete
        c.line([(cx, 17), (cx + side * 8, 9)], "black")
        c.disc(cx + side * 9, 8, 1.5, "black")
    # Escudos en la pared.
    for k, sx in enumerate((62, 74, 126, 138)):
        c.disc(sx, 45, 4, "black")
        c.disc(sx, 45, 3, ("brasa", "gold", "amber", "brasa")[k])
        c.p(sx, 45, "light")
    # Puertas abiertas con luz dorada que late.
    dx0, dx1, dy0 = cx - 11, cx + 11, 34
    glow = 0.5 + 0.5 * math.sin(ph)
    for y in range(dy0, horizon):
        for x in range(dx0, dx1 + 1):
            t = 1 - abs(x - cx) / 12
            col = "light" if t > 0.7 - glow * 0.15 else "gold" if t > 0.35 else "orange"
            c.p(x, y, col)
    c.rect(dx0 - 1, dy0 - 1, dx1 + 1, dy0 - 1, "black")
    for x0 in (dx0 - 7, dx1 + 2):  # hojas de la puerta, abiertas
        c.rect(x0, dy0 + 1, x0 + 5, horizon - 1, "wood2")
        c.rect(x0 + 2, dy0 + 6, x0 + 3, dy0 + 7, "gold")
    # Luz que sale por el suelo.
    for y in range(horizon, c.h):
        spread = 11 + (y - horizon) * 2.5
        for x in range(int(cx - spread), int(cx + spread) + 1):
            if (x + y) % 2 == 0 and abs(x - cx) < spread * (0.7 + 0.2 * glow):
                c.p(x, y, "amber" if abs(x - cx) < spread * 0.4 else "emberDark")
    # El guerrero (a doble tamaño), recortado contra la luz, con la capa al viento.
    k2 = 2
    gx = int(cx - 6 * k2 / 2) - 2
    gy = c.h - len(WARRIOR) * k2 - 1
    for j in range(7):
        sway = round(math.sin(ph * 2 + j * 0.6) * 1.5)
        c.rect(gx + 2 + sway, gy + 14 + j * 1.5, gx + 9 + sway, gy + 15 + j * 1.5, "sailDark")
    for j, row in enumerate(WARRIOR):
        for i, ch in enumerate(row):
            if ch in "#*":
                c.rect(gx + i * k2, gy + j * k2, gx + i * k2 + 1, gy + j * k2 + 1, "black" if ch == "#" else "gold")
    # Destello de la espada.
    if f % 8 < 3:
        sx, sy = gx + 6 * k2, gy - 1
        c.p(sx, sy, "white")
        for ddx, ddy in ((1, 0), (-1, 0), (0, -1)):
            c.p(sx + ddx, sy + ddy, "light")
    raven(c, 40 + 8 * math.cos(ph), 20 + 3 * math.sin(ph), f)
    raven(c, 165 + 8 * math.cos(ph + 2), 16 + 3 * math.sin(ph + 2), f + 2)
    embers(c, f, seed=23, count=16)
    title(c, "EINHERJAR", 2)


MOON_SIZE = 40


def moon_phase(phase: int) -> Image.Image:
    """Fase lunar como en Minecraft: 0 llena, 4 nueva; 1-3 menguante (luz a la izquierda), 5-7 creciente."""
    c = Px(MOON_SIZE, MOON_SIZE, fill="sky1")
    stars(c, MOON_SIZE + 10, 3, seed=200 + phase, count=14)
    cx = cy = MOON_SIZE / 2
    r = 14
    moon(c, cx, cy, r)
    k = math.cos(2 * math.pi * phase / 8)
    waning = 1 <= phase <= 3
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            dx, dy = (x - cx) / r, (y - cy) / r
            if dx * dx + dy * dy > 1:
                continue
            w = math.sqrt(max(0.0, 1 - dy * dy))
            side = -dx if waning else dx
            lit = side > -k * w if phase not in (0, 4) else phase == 0
            if not lit:
                c.p(x, y, "sky3" if (x + y) % 2 else "sky2")
    return c.export()


SKALD = [  # el skald sentado, de perfil, con capucha
    "...###.....",
    "..#####....",
    "..####.....",
    "...###.....",
    "..#####....",
    ".#######...",
    ".#######...",
    ".########..",
    "..#######..",
    "..########.",
    ".##########",
    ".##.....##.",
]

NOTE = ["..##", "..#.", "..#.", "###.", "##.."]


def song(c: Px, f: int) -> None:
    """El skald canta junto al fuego del salón; las notas suben con las chispas."""
    ph = f / FRAMES * math.tau
    floor = 64
    # Salón: pared de tablones con escudos y vigas.
    for y in range(c.h):
        for x in range(c.w):
            c.p(x, y, "wood0" if (x // 6) % 2 else "sky3" if y < floor else "wood1")
    for x in range(0, c.w, 6):
        for y in range(0, floor):
            c.p(x, y, "black")
    c.rect(0, 14, c.w, 15, "wood1")
    for k, sx in enumerate((24, 52, 148, 176)):
        c.disc(sx, 30, 6, "black")
        c.disc(sx, 30, 5, ("brasa", "gold", "amber", "brasa")[k])
        c.p(sx, 30, "light")
    c.rect(0, floor, c.w, c.h, "wood1")
    for x in range(c.w):
        c.p(x, floor, "black")
    # Resplandor del fuego que late.
    cx, base = 100, floor - 1
    glow = 0.5 + 0.5 * math.sin(ph * 2)
    for y in range(18, floor):
        for x in range(40, 160):
            d = math.hypot((x - cx) / 1.6, y - base)
            if d < 46 + glow * 4 and BAYER4[y % 4][x % 4] / 16 > d / 52:
                c.p(x, y, "emberDark" if d > 26 else "brasa")
    # Hoguera: piedras y llamas.
    for k in range(-4, 5):
        c.disc(cx + k * 3, base, 1.6, "stone1" if k % 2 else "stone2")
    for k in range(-6, 7):
        h = (11 - abs(k) * 1.4) * (0.75 + 0.35 * abs(math.sin(ph * 3 + k)))
        for j in range(int(h)):
            col = "brasa" if j < 2 else "amber" if j < h * 0.5 else "orange" if j < h * 0.8 else "gold"
            c.p(cx + k, base - 2 - j, col)
    # El skald, a la izquierda del fuego, con la lira dorada.
    k2 = 2
    gx, gy = 52, floor - len(SKALD) * k2
    for j, row in enumerate(SKALD):
        for i, ch in enumerate(row):
            if ch == "#":
                c.rect(gx + i * k2, gy + j * k2, gx + i * k2 + 1, gy + j * k2 + 1, "black")
    lx, ly = gx + 19, gy + 6
    c.line([(lx, ly), (lx + 2, ly + 12)], "gold")
    c.line([(lx + 8, ly), (lx + 6, ly + 12)], "gold")
    c.line([(lx, ly), (lx + 8, ly)], "gold")
    c.line([(lx + 2, ly + 12), (lx + 6, ly + 12)], "orange")
    for sx in (lx + 3, lx + 4, lx + 5):  # cuerdas que vibran
        c.line([(sx + (1 if (f + sx) % 4 < 2 else 0), ly + 1), (sx, ly + 11)], "light")
    # Notas que suben y se desvanecen.
    for n in range(4):
        t = ((f / FRAMES) + n / 4) % 1
        nx = lx + 10 + n * 9 + 4 * math.sin(ph + n)
        ny = ly + 4 - t * 38
        col = "light" if t < 0.4 else "gold" if t < 0.75 else "amber"
        c.sprite(int(nx), int(ny), NOTE, {"#": col})
    embers(c, f, seed=31, count=14)
    title(c, "EL CANTO DEL DOMINGO", 3)


BOARD = 48


def task_board() -> Image.Image:
    """Tablón de misiones: madera, tres pergaminos clavados y una runa encima."""
    c = Px(BOARD, BOARD, fill="sky1")
    cx = BOARD / 2
    for y in range(BOARD):
        for x in range(BOARD):
            d = math.hypot(x - cx, y - cx)
            if d < 23:
                c.p(x, y, c.dither(x, y, "sky4", "sky1", d / 23))
    # Postes y tablero.
    c.rect(9, 10, 11, 44, "wood0")
    c.rect(36, 10, 38, 44, "wood0")
    for y in range(12, 38):
        for x in range(8, 40):
            c.p(x, y, "wood2" if (y - 12) % 5 else "wood0")
    c.rect(7, 11, 40, 12, "black")
    c.rect(7, 38, 40, 38, "black")
    # Tres pergaminos (verde, ámbar y brasa: fácil, media, difícil).
    for k, (px, col) in enumerate(((11, "moss1"), (21, "amber"), (31, "brasa"))):
        top = 16 + (k % 2) * 2
        c.rect(px - 3, top, px + 3, top + 14, "light")
        c.rect(px - 3, top + 14, px + 3, top + 14, "gold")
        for line in range(3):
            c.rect(px - 2, top + 3 + line * 3, px + 1 + (line % 2), top + 3 + line * 3, "stone2")
        c.p(px, top, col)
        c.p(px, top - 1, "black")
    # Runa ᚠ dorada sobre el tablero.
    c.sprite(int(cx) - 2, 3, RUNES["fehu"], {"#": "gold"})
    return c.export()


WHEEL = 64


def wheel(c: Px, f: int) -> None:
    """La rueda de las nornas: ocho gajos con runas que giran bajo una flecha dorada."""
    cx = cy = WHEEL / 2
    r = 25
    for y in range(WHEEL):
        for x in range(WHEEL):
            d = math.hypot(x - cx, y - cy)
            if d < 31:
                c.p(x, y, c.dither(x, y, "sky4", "sky1", d / 31))
    turn = f / FRAMES * math.tau / 8 * 3  # vuelve a la misma posición en el bucle (3 gajos)
    colors = ["brasa", "amber", "sailDark", "orange", "moss0", "gold", "stone2", "emberDark"]
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            dx, dy = x - cx, y - cy
            d = math.hypot(dx, dy)
            if d > r:
                continue
            a = (math.atan2(dy, dx) - turn) % math.tau
            seg = int(a / (math.tau / 8))
            col = colors[seg]
            if d > r - 2:
                col = "wood0" if (x + y) % 2 else "black"
            elif abs((a % (math.tau / 8)) - 0.01) < 0.08 and d > 4:
                col = "black"  # radios
            c.p(x, y, col)
    for k in range(8):  # runas en cada gajo
        a = turn + (k + 0.5) * math.tau / 8
        gx, gy = cx + 15 * math.cos(a), cy + 15 * math.sin(a)
        c.sprite(int(gx) - 2, int(gy) - 3, RUNES[RUNE_ORDER[k % len(RUNE_ORDER)]], {"#": "light"})
    c.disc(cx, cy, 4, "black")
    c.disc(cx, cy, 3, "gold")
    c.p(cx, cy, "light")
    # Flecha arriba.
    c.poly([(cx - 4, 2), (cx + 4, 2), (cx, 9)], "black")
    c.poly([(cx - 3, 3), (cx + 3, 3), (cx, 7)], "gold")
    for k in range(5):  # destellos
        a = f / FRAMES * math.tau + k * math.tau / 5
        if (f + k) % 4 < 2:
            c.p(cx + 29 * math.cos(a), cy + 29 * math.sin(a), "light")


# ----------------------------------------------------------------------------- salida

def save_gif(name: str, imgs: list[Image.Image], ms: int) -> None:
    path = OUT / name
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=ms, loop=0, disposal=1, optimize=False)
    print(f"{name}: {path.stat().st_size // 1024} KiB, {len(imgs)} fotogramas, {imgs[0].width}x{imgs[0].height}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    preview = os.environ.get("ART_PREVIEW_DIR")
    if preview:
        Path(preview).mkdir(parents=True, exist_ok=True)
    welcome_frames = frames(welcome)
    farewell_frames = frames(farewell)
    offering_frames = frames(offering)
    save_gif("bienvenida.gif", welcome_frames, 100)
    save_gif("despedida.gif", farewell_frames, 120)
    save_gif("ofrenda.gif", offering_frames, 90)
    treasure_frames = frames(treasure)
    era_frames = frames(new_era, ERA_W, ERA_H)
    save_gif("tesoro.gif", treasure_frames, 80)
    save_gif("era.gif", era_frames, 110)
    horn_frames = frames(horn_call, HORN_W, HORN_H)
    save_gif("quedada.gif", horn_frames, 90)
    # Portada del evento de Discord (estática, 800×320).
    horn_frames[2].convert("RGB").save(OUT / "quedada.png", optimize=True)
    print(f"quedada.png: {(OUT / 'quedada.png').stat().st_size // 1024} KiB, {horn_frames[2].width}x{horn_frames[2].height}")
    for state in ("ok", "empty", "lag", "down"):
        img = panel_banner(state)
        img.save(OUT / f"panel-{state}.png", optimize=True)
        print(f"panel-{state}.png: {(OUT / f'panel-{state}.png').stat().st_size // 1024} KiB, {img.width}x{img.height}")
        if preview:
            img.convert("RGB").save(Path(preview) / f"panel-{state}.png")
    song_frames = frames(song, W, 75)
    save_gif("canto.gif", song_frames, 110)
    hero_frames = frames(einherjar, W, 75)
    save_gif("einherjar.gif", hero_frames, 100)
    for phase in range(8):
        img = moon_phase(phase)
        img.save(OUT / f"luna-{phase}.png", optimize=True)
        if preview:
            img.convert("RGB").save(Path(preview) / f"luna-{phase}.png")
    print("luna-0..7.png:", f"{MOON_SIZE * SCALE}x{MOON_SIZE * SCALE}")
    wheel_frames = frames(wheel, WHEEL, WHEEL)
    save_gif("ruleta.gif", wheel_frames, 70)
    board = task_board()
    board.save(OUT / "tareas.png", optimize=True)
    if preview:
        board.convert("RGB").save(Path(preview) / "tareas.png")
    clock_frames = frames(hourglass, CLOCK, CLOCK)
    save_gif("reloj.gif", clock_frames, 120)
    banner = rules_banner()
    banner.save(OUT / "runas.png", optimize=True)
    print(f"runas.png: {(OUT / 'runas.png').stat().st_size // 1024} KiB, {banner.width}x{banner.height}")

    if preview:  # primer fotograma de cada GIF, para revisarlos rápido
        Path(preview).mkdir(parents=True, exist_ok=True)
        for name, imgs in (
            ("bienvenida", welcome_frames),
            ("despedida", farewell_frames),
            ("ofrenda", offering_frames),
            ("tesoro", treasure_frames),
            ("era", era_frames),
            ("quedada", horn_frames),
            ("reloj", clock_frames),
            ("einherjar", hero_frames),
            ("canto", song_frames),
            ("ruleta", wheel_frames),
        ):
            imgs[0].convert("RGB").save(Path(preview) / f"{name}.png")
            imgs[FRAMES // 2].convert("RGB").save(Path(preview) / f"{name}-mitad.png")


if __name__ == "__main__":
    sys.exit(main())
