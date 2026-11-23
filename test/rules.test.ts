import { ChannelType } from "discord.js";
import { describe, expect, it } from "vitest";
import { buildRulesEmbeds, matchGuideChannels } from "../src/rules.js";

const total = (embeds: ReturnType<typeof buildRulesEmbeds>) =>
  embeds.reduce((n, e) => {
    const j = e.toJSON();
    return n + (j.title?.length ?? 0) + (j.description?.length ?? 0) + (j.footer?.text.length ?? 0);
  }, 0);

const text = (embeds: ReturnType<typeof buildRulesEmbeds>) => embeds.map((e) => e.toJSON().description ?? "").join("\n");

describe("buildRulesEmbeds", () => {
  it("la imagen va sola, como portada, en el primer embed", () => {
    const [cover, rules] = buildRulesEmbeds({ version: null, address: null, jarlId: null, imageUrl: "attachment://runas.png" });
    expect(cover?.toJSON().image?.url).toBe("attachment://runas.png");
    expect(cover?.toJSON().description).toBeUndefined();
    expect(rules?.toJSON().description).toMatch(/^# 📜 Las runas del reino/);
  });

  it("cada norma tiene su cabecera con número", () => {
    const all = text(buildRulesEmbeds({ version: null, address: null, jarlId: null }));
    expect(all).toContain("### 1️⃣ Honra a los demás guerreros\nNada de insultos");
    expect(all).toContain("### 8️⃣ La palabra del Jarl es ley");
  });

  it("cómo entrar: pasos numerados, versión, Jarl y dirección en bloque de código", () => {
    const all = text(buildRulesEmbeds({ version: "26.2", address: "reino.example:25565", jarlId: "111111111111111111" }));
    expect(all).toContain("Java 26.2");
    expect(all).toContain("1. Pídele el túnel a <@111111111111111111>.");
    expect(all).toContain("### 📍 Dirección del reino\n```\nreino.example:25565\n```");
  });

  it("sin dirección ni Jarl configurados, no deja huecos", () => {
    const all = text(buildRulesEmbeds({ version: null, address: null, jarlId: null }));
    expect(all).not.toContain("Dirección");
    expect(all).not.toContain("null");
    expect(all).toContain("Pídele el túnel al Jarl.");
  });

  it("cabe en los límites de Discord (4096 por descripción, 6000 por mensaje)", () => {
    const embeds = buildRulesEmbeds({
      version: "26.2",
      address: "x".repeat(100),
      jarlId: "111111111111111111",
      imageUrl: "attachment://runas.png",
    });
    for (const e of embeds) expect(e.toJSON().description?.length ?? 0).toBeLessThanOrEqual(4096);
    expect(total(embeds)).toBeLessThanOrEqual(6000);
  });
});

describe("guía de canales", () => {
  const guild = [
    { id: "1", name: "📯┃gjallarhorn", type: ChannelType.GuildText },
    { id: "2", name: "🔥 Hoguera del clan", type: ChannelType.GuildVoice },
    { id: "3", name: "📖┃crónicas", type: ChannelType.GuildText },
    { id: "9", name: "⚔️ VALHALLA cuervos", type: ChannelType.GuildCategory },
  ];

  it("encuentra los canales por nombre (no las categorías)", () => {
    const ids = matchGuideChannels(guild);
    expect(ids.get("gjallarhorn")).toBe("1");
    expect(ids.get("hoguera")).toBe("2");
    expect(ids.has("cuervos")).toBe(false);
  });

  it("agrupa por categoría, enlaza los encontrados y deja en texto los que no", () => {
    const all = text(buildRulesEmbeds({ version: null, address: null, jarlId: null, channelIds: matchGuideChannels(guild) }));
    expect(all).toContain("### 🏰 Asgard");
    expect(all).toContain("<#1> · llegadas");
    expect(all).toContain("<#2> · voz");
    expect(all).toContain("🐦‍⬛┃cuervos · Skald avisa");
  });
});
