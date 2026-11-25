import { describe, expect, it } from "vitest";
import { commands } from "../src/commands/index.js";
import { seasonProposalRow, SEASON_BUTTON_ID } from "../src/commands/temporada.js";
import { roman } from "../src/util/texts.js";

describe("eras", () => {
  it("números romanos para los nombres", () => {
    expect([1, 2, 4, 9, 14, 40].map(roman)).toEqual(["I", "II", "IV", "IX", "XIV", "XL"]);
  });

  it("la propuesta lleva el botón de abrir era", () => {
    const json = seasonProposalRow().toJSON();
    expect(json.components[0]).toMatchObject({ custom_id: SEASON_BUTTON_ID });
  });

  it("/regalo solo para administradores en Discord", () => {
    const regalo = commands.find((c) => c.data.name === "regalo")?.data.toJSON();
    expect(regalo?.default_member_permissions).toBe("8");
  });
});
