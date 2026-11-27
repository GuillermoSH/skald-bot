import { describe, expect, it } from "vitest";
import { describePrize } from "../src/commands/ruleta.js";
import type { CommandContext } from "../src/commands/types.js";
import { Economy } from "../src/core/economy.js";
import { BOOK_ENCHANTMENTS, LOOT_GROUPS, rollPrize, type Prize, type Rng } from "../src/core/loot.js";
import { buildGive } from "../src/core/rcon.js";
import { MAX_SPINS_PER_DAY, Roulette, SPIN_COST } from "../src/roulette.js";
import { memoryRealm } from "./helpers.js";

describe("tablas de botín", () => {
  it("los grupos suman 100 (son porcentajes)", () => {
    expect(LOOT_GROUPS.reduce((n, g) => n + g.weight, 0)).toBe(100);
  });

  it("muchas tiradas: cantidades dentro de su rango y libros compatibles", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      const p = rollPrize();
      seen.add(p.group);
      if (p.kind === "item") {
        const entry = LOOT_GROUPS.flatMap((g) => g.items ?? []).find((e) => e.id === p.id);
        expect(entry).toBeDefined();
        expect(p.count).toBeGreaterThanOrEqual(entry?.min ?? 0);
        expect(p.count).toBeLessThanOrEqual(entry?.max ?? 0);
      }
      if (p.kind === "book") {
        const ids = p.enchantments.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.includes("fortune") && ids.includes("silk_touch")).toBe(false);
        for (const e of p.enchantments) {
          const def = BOOK_ENCHANTMENTS.find((b) => b.id === e.id);
          expect(e.level).toBeGreaterThanOrEqual(def?.min ?? 99);
          expect(e.level).toBeLessThanOrEqual(def?.max ?? 0);
        }
      }
    }
    expect(seen.size).toBe(LOOT_GROUPS.length);
  });
});

describe("buildGive (plantilla cerrada)", () => {
  it("objeto, cantidad y libro con encantamientos", () => {
    expect(buildGive("Ragnar", "minecraft:bread", 12)).toBe("give Ragnar minecraft:bread 12");
    expect(buildGive("Ragnar", "minecraft:enchanted_book", 1, [{ id: "mending", level: 1 }, { id: "unbreaking", level: 3 }])).toBe(
      'give Ragnar minecraft:enchanted_book[minecraft:stored_enchantments={"minecraft:mending":1,"minecraft:unbreaking":3}] 1',
    );
  });
  it("rechaza destinos, objetos y cantidades raros", () => {
    expect(() => buildGive("@a", "minecraft:bread", 1)).toThrow();
    expect(() => buildGive("Ragnar", "minecraft:bread 64\nop Ragnar", 1)).toThrow();
    expect(() => buildGive("Ragnar", "otro:cosa", 1)).toThrow();
    expect(() => buildGive("Ragnar", "minecraft:diamond", 65)).toThrow();
    expect(() => buildGive("Ragnar", "minecraft:enchanted_book", 1, [{ id: "a}]x", level: 1 }])).toThrow();
  });
});

describe("Roulette", () => {
  function setup(online: boolean, giveResponse = "Gave 12 [Bread] to Ragnar") {
    const { db, seasonId } = memoryRealm();
    const economy = new Economy(db, seasonId, "UTC");
    const gives: string[] = [];
    const ctx = {
      realm: { economy, tasks: {} },
      rcon: {
        listPlayers: () => Promise.resolve({ online: 1, max: 20, names: online ? ["Ragnar"] : [] }),
        give: (player: string, item: string, count: number) => {
          gives.push(`${player} ${item} ${count}`);
          return Promise.resolve(giveResponse);
        },
      },
    } as unknown as CommandContext;
    const recorded: Prize[] = [];
    const nothing: Rng = () => 0; // grupo «nada» siempre, salvo que se diga otra cosa
    return { economy, gives, recorded, roulette: (rng: Rng = nothing) => new Roulette(ctx, (_p, prize) => recorded.push(prize), rng) };
  }

  it("hay que estar conectado y tener monedas; límite de 5 al día", async () => {
    const off = setup(false);
    off.economy.credit("u", 1000, "test", "2026-01-01");
    expect(await off.roulette().spin("u", "Ragnar")).toEqual({ ok: false, reason: "offline" });

    const on = setup(true);
    expect(await on.roulette().spin("u", "Ragnar")).toMatchObject({ ok: false, reason: "poor" });
    on.economy.credit("u", 1000, "test", new Date().toISOString().slice(0, 10));
    const r = on.roulette();
    for (let i = 0; i < MAX_SPINS_PER_DAY; i++) expect((await r.spin("u", "Ragnar")).ok).toBe(true);
    expect(await r.spin("u", "Ragnar")).toMatchObject({ ok: false, reason: "limit" });
    expect(on.economy.balance("u")).toBe(1000 - MAX_SPINS_PER_DAY * SPIN_COST);
  });

  it("entrega el objeto y lo apunta; si no se puede entregar, devuelve las monedas", async () => {
    // rng: grupo «supervivencia» (pesos 25+20 → 45), primera entrada, cantidad mínima.
    const rng = () => {
      const calls = [45, 0, 0];
      return (max: number) => (calls.shift() ?? 0) % max;
    };
    const ok = setup(true);
    ok.economy.credit("u", 100, "test", new Date().toISOString().slice(0, 10));
    const r = await ok.roulette(rng()).spin("u", "Ragnar");
    expect(r).toMatchObject({ ok: true, prize: { kind: "item", group: "survival", id: "minecraft:bread", count: 8 } });
    expect(ok.gives).toEqual(["Ragnar minecraft:bread 8"]);
    expect(ok.recorded).toHaveLength(1);

    const fail = setup(true, "No player was found");
    fail.economy.credit("u", 100, "test", new Date().toISOString().slice(0, 10));
    expect(await fail.roulette(rng()).spin("u", "Ragnar")).toMatchObject({ ok: false, reason: "give_failed" });
    expect(fail.economy.balance("u")).toBe(100);
  });
});

describe("describePrize", () => {
  const lang = {
    blockOrItem: (id: string) => ({ "minecraft:bread": "Pan" })[id] ?? id,
    fromKey: (key: string) => ({ "enchantment.minecraft.mending": "Reparación", "enchantment.minecraft.unbreaking": "Irrompibilidad", "enchantment.level.3": "III" })[key] ?? "Level",
  };
  it("en español, y los de un solo nivel sin número", () => {
    expect(describePrize({ kind: "item", group: "survival", id: "minecraft:bread", count: 12 }, lang)).toBe("12 × Pan");
    expect(describePrize({ kind: "book", group: "books", enchantments: [{ id: "mending", level: 1 }, { id: "unbreaking", level: 3 }] }, lang)).toBe(
      "Libro de Reparación y Irrompibilidad III",
    );
    expect(describePrize({ kind: "coins", group: "jackpot", coins: 300 }, lang)).toContain("300");
  });
});
