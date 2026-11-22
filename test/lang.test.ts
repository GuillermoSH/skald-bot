import { describe, expect, it, vi } from "vitest";
import { fillTemplate, prettify, Translator, type LangLoader } from "../src/core/lang.js";
import { fixtureTranslator } from "./helpers.js";

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


describe("plantillas de muerte (jar + es_es)", () => {
  it("reconoce muertes y las reescribe en español", async () => {
    const tr = await fixtureTranslator();
    const d = tr.matchDeath("Ragnar was blown up by Creeper");
    expect(d).toEqual({ key: "death.attack.explosion.player", args: ["Ragnar", "Creeper"], combat: true });
    expect(d && tr.renderDeath(d)).toBe("Ragnar ha explotado por Creeper");
  });

  it("traduce el mob y el arma", async () => {
    const tr = await fixtureTranslator();
    const d = tr.matchDeath("Ragnar was slain by Zombified Piglin using [Diamond Sword]");
    expect(d && tr.renderDeath(d)).toBe("Ragnar ha sido víctima de Piglin zombificado y su [Espada de diamante]");
  });

  it("distingue muertes en combate de las demás", async () => {
    const tr = await fixtureTranslator();
    expect(tr.matchDeath("Ragnar fell from a high place")?.combat).toBe(false);
    expect(tr.matchDeath("Ragnar drowned")?.combat).toBe(false);
    expect(tr.matchDeath("Ragnar was speared by Zombie")?.combat).toBe(true);
  });

  it("no confunde otras líneas con muertes", async () => {
    const tr = await fixtureTranslator();
    expect(tr.matchDeath("Ragnar joined the game")).toBeNull();
    expect(tr.matchDeath("Server empty for 60 seconds, pausing")).toBeNull();
    // El primer argumento siempre es un nombre de jugador válido.
    expect(tr.matchDeath("Named entity Wolf['Rex'] was slain by Zombie")).toBeNull();
  });

  it("traduce títulos de logros del inglés del log", async () => {
    const tr = await fixtureTranslator();
    expect(tr.fromEnglishAdvancementTitle("Hot Tourist Destinations")).toBe("Cálidos destinos turísticos");
    expect(tr.fromEnglishAdvancementTitle("Un logro de un mod")).toBe("Un logro de un mod");
  });

  it("deja igual los nombres que no conoce (mobs con nombre, jugadores)", async () => {
    const tr = await fixtureTranslator();
    expect(tr.fromEnglishName("Lagertha")).toBe("Lagertha");
    expect(tr.fromEnglishName("[Excalibur]")).toBe("[Excalibur]");
  });
});

describe("fillTemplate", () => {
  it("rellena argumentos posicionales y en orden", () => {
    expect(fillTemplate("%2$s mató a %1$s", ["A", "B"])).toBe("B mató a A");
    expect(fillTemplate("%s se unió", ["A"])).toBe("A se unió");
  });
});
