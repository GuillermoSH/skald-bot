/**
 * Tablas de botín de la ruleta, por grupos (como los mods de botín): primero se sortea
 * el grupo por su peso, luego una entrada del grupo por el suyo, y la cantidad varía en
 * cada tirada dentro de su rango (más rara, menos cantidad). Los libros llevan uno o
 * dos encantamientos compatibles. Todo de una lista cerrada: nada viene de fuera.
 */
import { randomInt } from "node:crypto";

export type Rng = (maxExclusive: number) => number;
export const cryptoRng: Rng = (max) => randomInt(max);

export interface ItemEntry {
  id: string;
  weight: number;
  min: number;
  max: number;
}

export type LootGroupId = "nothing" | "refund" | "survival" | "minerals" | "rare" | "valuable" | "books" | "jackpot";

export interface LootGroup {
  id: LootGroupId;
  /** Peso del grupo (todos suman 100: es el porcentaje). */
  weight: number;
  items?: readonly ItemEntry[];
  coins?: number;
}

export const LOOT_GROUPS: readonly LootGroup[] = [
  { id: "nothing", weight: 25 },
  { id: "refund", weight: 20, coins: 50 },
  {
    id: "survival",
    weight: 20,
    items: [
      { id: "minecraft:bread", weight: 3, min: 8, max: 16 },
      { id: "minecraft:cooked_beef", weight: 3, min: 6, max: 12 },
      { id: "minecraft:firework_rocket", weight: 2, min: 4, max: 10 },
      { id: "minecraft:torch", weight: 2, min: 16, max: 32 },
      { id: "minecraft:arrow", weight: 2, min: 16, max: 32 },
      { id: "minecraft:golden_carrot", weight: 1, min: 4, max: 8 },
    ],
  },
  {
    id: "minerals",
    weight: 15,
    items: [
      { id: "minecraft:coal", weight: 3, min: 12, max: 24 },
      { id: "minecraft:copper_ingot", weight: 3, min: 10, max: 16 },
      { id: "minecraft:iron_ingot", weight: 3, min: 6, max: 10 },
      { id: "minecraft:redstone", weight: 2, min: 8, max: 16 },
      { id: "minecraft:lapis_lazuli", weight: 2, min: 6, max: 12 },
      { id: "minecraft:gold_ingot", weight: 1, min: 2, max: 4 },
    ],
  },
  {
    id: "rare",
    weight: 10,
    items: [
      { id: "minecraft:golden_apple", weight: 3, min: 1, max: 2 },
      { id: "minecraft:ender_pearl", weight: 3, min: 2, max: 4 },
      { id: "minecraft:experience_bottle", weight: 3, min: 4, max: 8 },
      { id: "minecraft:name_tag", weight: 2, min: 1, max: 1 },
      { id: "minecraft:saddle", weight: 1, min: 1, max: 1 },
    ],
  },
  {
    id: "valuable",
    weight: 6,
    items: [
      { id: "minecraft:obsidian", weight: 3, min: 4, max: 8 },
      { id: "minecraft:diamond", weight: 2, min: 1, max: 3 },
      { id: "minecraft:emerald", weight: 2, min: 1, max: 2 },
    ],
  },
  { id: "books", weight: 3 },
  { id: "jackpot", weight: 1, coins: 300 },
];

export interface EnchantEntry {
  id: string;
  min: number;
  max: number;
  /** Encantamientos con los que no puede ir en el mismo libro. */
  conflicts?: readonly string[];
}

export const BOOK_ENCHANTMENTS: readonly EnchantEntry[] = [
  { id: "mending", min: 1, max: 1 },
  { id: "unbreaking", min: 2, max: 3 },
  { id: "efficiency", min: 3, max: 5 },
  { id: "fortune", min: 1, max: 3, conflicts: ["silk_touch"] },
  { id: "silk_touch", min: 1, max: 1, conflicts: ["fortune"] },
  { id: "looting", min: 1, max: 3 },
  { id: "sharpness", min: 3, max: 5 },
  { id: "protection", min: 2, max: 4 },
  { id: "feather_falling", min: 2, max: 4 },
  { id: "respiration", min: 1, max: 3 },
  { id: "power", min: 3, max: 5 },
  { id: "depth_strider", min: 1, max: 3 },
];
/** Probabilidad (sobre 100) de que el libro lleve un segundo encantamiento. */
export const SECOND_ENCHANT_CHANCE = 35;

export type Prize =
  | { kind: "nothing"; group: LootGroupId }
  | { kind: "coins"; group: LootGroupId; coins: number }
  | { kind: "item"; group: LootGroupId; id: string; count: number }
  | { kind: "book"; group: LootGroupId; enchantments: { id: string; level: number }[] };

function pickWeighted<T extends { weight: number }>(list: readonly T[], rng: Rng): T {
  const total = list.reduce((n, e) => n + e.weight, 0);
  let roll = rng(total);
  for (const e of list) {
    if (roll < e.weight) return e;
    roll -= e.weight;
  }
  return list[list.length - 1] as T;
}

const between = (min: number, max: number, rng: Rng) => min + rng(max - min + 1);

export function rollPrize(rng: Rng = cryptoRng): Prize {
  const group = pickWeighted(LOOT_GROUPS, rng);
  if (group.id === "nothing") return { kind: "nothing", group: group.id };
  if (group.coins) return { kind: "coins", group: group.id, coins: group.coins };
  if (group.id === "books") {
    const first = BOOK_ENCHANTMENTS[rng(BOOK_ENCHANTMENTS.length)] as EnchantEntry;
    const enchantments = [{ id: first.id, level: between(first.min, first.max, rng) }];
    if (rng(100) < SECOND_ENCHANT_CHANCE) {
      const options = BOOK_ENCHANTMENTS.filter((e) => e.id !== first.id && !first.conflicts?.includes(e.id) && !e.conflicts?.includes(first.id));
      const second = options[rng(options.length)];
      if (second) enchantments.push({ id: second.id, level: between(second.min, second.max, rng) });
    }
    return { kind: "book", group: group.id, enchantments };
  }
  const entry = pickWeighted(group.items ?? [], rng);
  return { kind: "item", group: group.id, id: entry.id, count: between(entry.min, entry.max, rng) };
}
