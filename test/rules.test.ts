import { describe, expect, it } from "vitest";
import { buildRulesEmbeds } from "../src/rules.js";

const total = (embeds: ReturnType<typeof buildRulesEmbeds>) =>
  embeds.reduce((n, e) => {
    const j = e.toJSON();
    return n + (j.title?.length ?? 0) + (j.description?.length ?? 0) + (j.footer?.text.length ?? 0);
  }, 0);

describe("buildRulesEmbeds", () => {
  it("incluye dirección, versión y la mención del Jarl si los hay", () => {
    const [, , join] = buildRulesEmbeds({ version: "26.2", address: "reino.example:25565", jarlId: "111111111111111111" });
    const text = join?.toJSON().description ?? "";
    expect(text).toContain("Java 26.2");
    expect(text).toContain("`reino.example:25565`");
    expect(text).toContain("<@111111111111111111>");
  });

  it("sin dirección ni Jarl configurados, no deja huecos", () => {
    const [, , join] = buildRulesEmbeds({ version: null, address: null, jarlId: null });
    const text = join?.toJSON().description ?? "";
    expect(text).not.toContain("Dirección");
    expect(text).not.toContain("null");
    expect(text).toContain("Escríbele al Jarl");
  });

  it("las normas van numeradas", () => {
    const [main] = buildRulesEmbeds({ version: null, address: null, jarlId: null });
    expect(main?.toJSON().description).toMatch(/\n1\. .*\n2\. /);
  });

  it("cabe en los límites de Discord (4096 por descripción, 6000 por mensaje)", () => {
    const embeds = buildRulesEmbeds({ version: "26.2", address: "x".repeat(100), jarlId: "111111111111111111" });
    for (const e of embeds) expect(e.toJSON().description?.length ?? 0).toBeLessThanOrEqual(4096);
    expect(total(embeds)).toBeLessThanOrEqual(6000);
  });
});
