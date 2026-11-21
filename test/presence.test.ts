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

describe("choosePresence", () => {
  it("caído → no molestar, jugando", () => {
    expect(choosePresence({ online: false })).toEqual({
      status: "dnd",
      activities: [{ name: "El reino duerme (offline)", type: ActivityType.Playing }],
    });
  });

  it("vacío → ausente, escuchando", () => {
    expect(choosePresence(online(0))).toEqual({
      status: "idle",
      activities: [{ name: "el silencio de las salas", type: ActivityType.Listening }],
    });
  });

  it("con jugadores → en línea, viendo (singular y plural)", () => {
    expect(choosePresence(online(1)).activities?.[0]?.name).toBe("a 1 guerrero en el reino");
    expect(choosePresence(online(3))).toEqual({
      status: "online",
      activities: [{ name: "a 3 guerreros en el reino", type: ActivityType.Watching }],
    });
  });
});
