import { describe, expect, it } from "vitest";
import { detectAdapter } from "../src/adapters/index.js";

describe("adaptadores", () => {
  it("Fabric por el lanzador que deja itzg (con su versión)", () => {
    const input = { versionName: "26.2", dataFiles: ["eula.txt", "fabric-server-mc.26.2-loader.0.20.1-launcher.1.1.2.jar", "mods"] };
    const a = detectAdapter(input);
    expect(a.id).toBe("fabric");
    expect(a.describe?.(input)).toBe("Fabric 0.20.1");
  });

  it("sin lanzador de Fabric, vanilla", () => {
    expect(detectAdapter({ versionName: "26.2", dataFiles: ["eula.txt", "server.properties"] }).id).toBe("vanilla");
    expect(detectAdapter({ versionName: "26.2" }).id).toBe("vanilla");
  });
});
