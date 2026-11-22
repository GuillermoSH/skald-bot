import { ActivityType } from "discord.js";
import { describe, expect, it } from "vitest";
import type { ServerStatus } from "../src/core/status.js";
import { choosePresence } from "../src/presence.js";

const online = (players: number): ServerStatus => ({
  online: true,
  version: "26.2",
  protocol: 776,
  playersOnline: players,
  playersMax: 20,
  playerSample: [],
  motd: "",
  latencyMs: 2,
});

const custom = (state: string) => [{ type: ActivityType.Custom, name: "Custom Status", state }];

describe("choosePresence", () => {
  it("caído → no molestar", () => {
    expect(choosePresence({ online: false })).toEqual({
      status: "dnd",
      activities: custom("💤 El reino duerme (offline)"),
    });
  });

  it("vacío → ausente", () => {
    expect(choosePresence(online(0))).toEqual({ status: "idle", activities: custom("🌙 Silencio en las salas") });
  });

  it("con jugadores → en línea (singular y plural)", () => {
    expect(choosePresence(online(1))).toEqual({ status: "online", activities: custom("⚔️ 1 guerrero en el reino") });
    expect(choosePresence(online(3)).activities?.[0]?.state).toBe("⚔️ 3 guerreros en el reino");
  });
});
