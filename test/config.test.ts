import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

const valid = {
  DISCORD_TOKEN: "token-de-prueba",
  DISCORD_GUILD_ID: "123456789012345678",
  RCON_PASSWORD: "secreto-de-prueba",
};

describe("loadConfig", () => {
  it("aplica valores por defecto", () => {
    const c = loadConfig(valid);
    expect(c.RCON_HOST).toBe("minecraft");
    expect(c.RCON_PORT).toBe(25575);
    expect(c.ADMIN_USER_IDS).toEqual([]);
  });

  it("parsea la lista de administradores", () => {
    const c = loadConfig({ ...valid, ADMIN_USER_IDS: "123456789012345678, 876543210987654321" });
    expect(c.ADMIN_USER_IDS).toEqual(["123456789012345678", "876543210987654321"]);
  });

  it("falla si falta algo obligatorio, listando la variable", () => {
    expect(() => loadConfig({ ...valid, RCON_PASSWORD: "" })).toThrow(/RCON_PASSWORD/);
  });

  it("nunca incluye valores en el mensaje de error", () => {
    try {
      loadConfig({ ...valid, DISCORD_GUILD_ID: "no-es-un-id", RCON_PORT: "99999" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const msg = (error as Error).message;
      expect(msg).toContain("DISCORD_GUILD_ID");
      expect(msg).toContain("RCON_PORT");
      expect(msg).not.toContain("token-de-prueba");
      expect(msg).not.toContain("secreto-de-prueba");
      expect(msg).not.toContain("no-es-un-id");
    }
  });
});

describe("configuración del heraldo", () => {
  it("acepta canales, rol y dirección opcionales", () => {
    const c = loadConfig({
      ...valid,
      HERALD_CHANNEL_ID: "200000000000000001",
      AUTO_ROLE_ID: "300000000000000001",
      MC_PUBLIC_ADDRESS: "  reino.example  ",
    });
    expect(c.HERALD_CHANNEL_ID).toBe("200000000000000001");
    expect(c.MC_PUBLIC_ADDRESS).toBe("reino.example");
  });

  it("rechaza un rol que no es un ID", () => {
    expect(() => loadConfig({ ...valid, AUTO_ROLE_ID: "Viajero" })).toThrow(/AUTO_ROLE_ID/);
  });
});

describe("STATE_DIR", () => {
  it("por defecto /state", () => {
    expect(loadConfig(valid).STATE_DIR).toBe("/state");
  });
  it("nunca dentro de la carpeta del mundo", () => {
    expect(() => loadConfig({ ...valid, DATA_DIR: "/data", STATE_DIR: "/data/skald" })).toThrow(/STATE_DIR/);
    expect(() => loadConfig({ ...valid, DATA_DIR: "/data", STATE_DIR: "/data" })).toThrow(/STATE_DIR/);
    expect(loadConfig({ ...valid, DATA_DIR: "/data", STATE_DIR: "/data-skald" }).STATE_DIR).toBe("/data-skald");
  });
});
