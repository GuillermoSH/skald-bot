import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("imágenes de assets/", () => {
  it.each(["bienvenida.gif", "despedida.gif", "ofrenda.gif"])("%s es un GIF animado válido", (name) => {
    const data = readFileSync(`assets/${name}`);
    expect(data.subarray(0, 6).toString()).toBe("GIF89a");
    expect(data.at(-1)).toBe(0x3b); // fin de fichero GIF
    expect(data.includes(Buffer.from("NETSCAPE2.0"))).toBe(true); // en bucle
    expect(data.length).toBeLessThan(8 * 1024 * 1024); // límite de Discord
  });

  it("runas.png es un PNG", () => {
    expect(existsSync("assets/runas.png")).toBe(true);
    expect(readFileSync("assets/runas.png").subarray(1, 4).toString()).toBe("PNG");
  });
});
