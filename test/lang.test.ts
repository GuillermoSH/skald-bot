import { describe, expect, it, vi } from "vitest";
import { prettify, Translator, type LangLoader } from "../src/core/lang.js";

const table = new Map([
  ["advancements.nether.explore_nether.title", "Cálidos destinos turísticos"],
  ["entity.minecraft.zombified_piglin", "Piglin zombificado"],
  ["block.minecraft.netherrack", "Netherrack"],
  ["item.minecraft.egg", "Huevo"],
]);

describe("Translator", () => {
  it("traduce logros, mobs, bloques y objetos", async () => {
    const tr = new Translator(() => Promise.resolve("26.2"), () => Promise.resolve(table));
    await tr.ready();
    expect(tr.advancement("minecraft:nether/explore_nether")).toBe("Cálidos destinos turísticos");
    expect(tr.entity("minecraft:zombified_piglin")).toBe("Piglin zombificado");
    expect(tr.blockOrItem("minecraft:netherrack")).toBe("Netherrack");
    expect(tr.blockOrItem("minecraft:egg")).toBe("Huevo");
  });

  it("saca la versión de nombres como «Paper 26.2»", async () => {
    const loader = vi.fn<LangLoader>().mockResolvedValue(table);
    await new Translator(() => Promise.resolve("Paper 26.2"), loader).ready();
    expect(loader).toHaveBeenCalledWith("26.2");
  });

  it("si no puede cargar, usa el id legible y no reintenta enseguida", async () => {
    const loader = vi.fn<LangLoader>().mockRejectedValue(new Error("sin red"));
    const tr = new Translator(() => Promise.resolve("26.2"), loader);
    await tr.ready();
    await tr.ready();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(tr.advancement("minecraft:story/mine_stone")).toBe("Mine stone");
    expect(tr.entity("minecraft:cave_spider")).toBe("Cave spider");
  });

  it("sin versión del servidor no intenta descargar", async () => {
    const loader = vi.fn<LangLoader>();
    await new Translator(() => Promise.resolve(null), loader).ready();
    expect(loader).not.toHaveBeenCalled();
  });
});

describe("prettify", () => {
  it("marca los ids de mods", () => {
    expect(prettify("brass_ingot", "create")).toBe("Brass ingot (create)");
  });
});
