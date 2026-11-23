import { describe, expect, it } from "vitest";
import { alertChannelFor } from "../src/alerts.js";
import { isCommandChannelAllowed } from "../src/commands/guard.js";
import { loadConfig } from "../src/config.js";

const base = { DISCORD_TOKEN: "t", DISCORD_GUILD_ID: "123456789012345678", RCON_PASSWORD: "p" };
const CRONICAS = "500000000000000001";
const YUNQUE = "500000000000000009";

describe("isCommandChannelAllowed", () => {
  it("sin lista, en todos los canales", () => {
    expect(isCommandChannelAllowed(loadConfig(base), "1", null)).toBe(true);
  });

  it("con lista: sus canales, sus hilos y el de administración", () => {
    const c = loadConfig({ ...base, COMMAND_CHANNEL_IDS: CRONICAS, ADMIN_CHANNEL_ID: YUNQUE });
    expect(isCommandChannelAllowed(c, CRONICAS, null)).toBe(true);
    expect(isCommandChannelAllowed(c, "999", CRONICAS)).toBe(true); // hilo dentro de crónicas
    expect(isCommandChannelAllowed(c, YUNQUE, null)).toBe(true);
    expect(isCommandChannelAllowed(c, "777", null)).toBe(false);
  });
});

describe("alertChannelFor", () => {
  it("cada tipo a su canal específico o al general", () => {
    const c = loadConfig({
      ...base,
      ALERT_CHANNEL_ID: "600000000000000001",
      ALERT_CHANNEL_DEATH: "600000000000000002",
      ALERT_EVENTS: "join,death,server",
    });
    expect(Object.fromEntries(alertChannelFor(c))).toEqual({
      join: "600000000000000001",
      death: "600000000000000002",
      server: "600000000000000001",
    });
  });

  it("sin canal general, solo los tipos con canal propio", () => {
    const c = loadConfig({ ...base, ALERT_CHANNEL_ADVANCEMENT: "600000000000000003" });
    expect([...alertChannelFor(c).keys()]).toEqual(["advancement"]);
  });
});
