import { describe, expect, it } from "vitest";
import { isValidPlayerName, safeText } from "../src/util/escape.js";

describe("safeText", () => {
  it("neutraliza menciones", () => {
    expect(safeText("@everyone hola")).not.toContain("@everyone");
    expect(safeText("<@123456789012345678>")).not.toMatch(/<@\d+>/);
  });

  it("escapa markdown", () => {
    expect(safeText("**negrita** _x_")).toBe("\\*\\*negrita\\*\\* \\_x\\_");
  });

  it("quita caracteres de control y recorta", () => {
    expect(safeText("a\u0000b\u0007c")).toBe("abc");
    expect(safeText("x".repeat(300), 10)).toHaveLength(10);
  });
});

describe("isValidPlayerName", () => {
  it.each(["Ragnar", "Steve_99", "abc"])("acepta %s", (n) => {
    expect(isValidPlayerName(n)).toBe(true);
  });
  it.each(["ab", "nombre-con-guion", "@everyone", "x".repeat(17)])("rechaza %s", (n) => {
    expect(isValidPlayerName(n)).toBe(false);
  });
});
