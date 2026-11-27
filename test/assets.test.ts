import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("imágenes de assets/", () => {
  it.each(["bienvenida.gif", "despedida.gif", "ofrenda.gif", "tesoro.gif", "era.gif", "quedada.gif", "reloj.gif", "einherjar.gif", "canto.gif"])("%s es un GIF animado válido", (name) => {
    const data = readFileSync(`assets/${name}`);
    expect(data.subarray(0, 6).toString()).toBe("GIF89a");
    expect(data.at(-1)).toBe(0x3b); // fin de fichero GIF
    expect(data.includes(Buffer.from("NETSCAPE2.0"))).toBe(true); // en bucle
    expect(data.length).toBeLessThan(8 * 1024 * 1024); // límite de Discord
  });

  it.each(["runas.png", "quedada.png", "panel-ok.png", "panel-empty.png", "panel-lag.png", "panel-down.png", ...Array.from({ length: 8 }, (_, i) => `luna-${i}.png`)])("%s es un PNG", (name) => {
    expect(existsSync(`assets/${name}`)).toBe(true);
    expect(readFileSync(`assets/${name}`).subarray(1, 4).toString()).toBe("PNG");
  });
});
