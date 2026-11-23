import { describe, expect, it } from "vitest";
import { asset, imageFileName } from "../src/util/assets.js";

describe("asset", () => {
  it("sin versionar, el adjunto se llama igual que el fichero", () => {
    expect(asset("bienvenida.gif")?.url).toBe("attachment://bienvenida.gif");
  });

  it("versionado, lleva la huella del contenido en el nombre", () => {
    expect(asset("runas.png", { versioned: true })?.url).toMatch(/^attachment:\/\/runas-[0-9a-f]{8}\.png$/);
  });

  it("si falta la imagen devuelve null", () => {
    expect(asset("no-existe.png")).toBeNull();
  });
});

describe("imageFileName", () => {
  it("saca el nombre de un adjunto y de una URL del CDN", () => {
    expect(imageFileName("attachment://runas-1a2b3c4d.png")).toBe("runas-1a2b3c4d.png");
    expect(imageFileName("https://cdn.discordapp.com/attachments/1/2/runas.png?ex=abc&is=def")).toBe("runas.png");
    expect(imageFileName(undefined)).toBeNull();
  });
});
