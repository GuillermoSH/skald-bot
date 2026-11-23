import { EventEmitter } from "node:events";
import { Events, type Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { Herald, heraldNeedsMembers, isNewBoost } from "../src/herald.js";

const GUILD = "123456789012345678";
const base = { DISCORD_TOKEN: "t", DISCORD_GUILD_ID: GUILD, RCON_PASSWORD: "p" };
const config = loadConfig({
  ...base,
  HERALD_CHANNEL_ID: "200000000000000001",
  RULES_CHANNEL_ID: "200000000000000002",
  AUTO_ROLE_ID: "300000000000000001",
});

function fakeClient() {
  const emitter = new EventEmitter();
  const channel = { isSendable: () => true, isDMBased: () => true, send: vi.fn().mockResolvedValue(undefined) };
  const client = {
    channels: { fetch: vi.fn().mockResolvedValue(channel) },
    user: { id: "999" },
    on: (event: string, fn: (...args: unknown[]) => void) => emitter.on(event, fn),
  } as unknown as Client<true>;
  return { client, emitter, channel };
}

const user = (fields: Record<string, unknown>) => ({
  displayAvatarURL: () => "https://cdn.example/avatar.png",
  ...fields,
});

function fakeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: "400000000000000001",
    guild: {
      id: GUILD,
      name: "El reino",
      premiumSubscriptionCount: 3,
      premiumTier: 1,
      memberCount: 12,
      roles: { cache: new Map([["300000000000000001", { name: "🧭 Viajero" }]]) },
    },
    user: user({ bot: false, globalName: "Ragnar", username: "ragnar" }),
    partial: false,
    premiumSince: null,
    toString: () => "<@400000000000000001>",
    roles: { add: vi.fn().mockResolvedValue(undefined) },
    send: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Herald", () => {
  it("al entrar: rol automático, bienvenida en el canal (solo menciona al nuevo) y privado con las runas", async () => {
    const { client, emitter, channel } = fakeClient();
    await new Herald(config).attach(client);
    const member = fakeMember();
    emitter.emit(Events.GuildMemberAdd, member);
    await flush();

    expect(member.roles.add).toHaveBeenCalledWith("300000000000000001", expect.any(String));
    expect(channel.send).toHaveBeenCalledTimes(1);
    const welcome = channel.send.mock.calls[0]?.[0] as {
      content: string;
      allowedMentions: unknown;
      embeds: { toJSON(): { description?: string; image?: { url: string }; footer?: { text: string } } }[];
      files: unknown[];
    };
    expect(welcome.content).toContain("<@400000000000000001>");
    expect(welcome.content).toContain("<#200000000000000002>");
    expect(welcome.allowedMentions).toEqual({ users: ["400000000000000001"] });
    const embed = welcome.embeds[0]?.toJSON();
    expect(embed?.description).toContain("🧭 Viajero");
    expect(embed?.image?.url).toBe("attachment://bienvenida.gif");
    expect(embed?.footer?.text).toContain("nº 12");
    expect(welcome.files).toHaveLength(1);
    const dm = member.send.mock.calls[0]?.[0] as { content: string };
    expect(dm.content).toContain(`https://discord.com/channels/${GUILD}/200000000000000002`);
  });

  it("ignora a otros bots y a otros servidores", async () => {
    const { client, emitter, channel } = fakeClient();
    await new Herald(config).attach(client);
    const bot = fakeMember({ user: user({ bot: true, username: "otro" }) });
    const stranger = fakeMember({ guild: { id: "1", name: "x" } });
    emitter.emit(Events.GuildMemberAdd, bot);
    emitter.emit(Events.GuildMemberAdd, stranger);
    await flush();
    expect(channel.send).not.toHaveBeenCalled();
    expect(bot.roles.add).not.toHaveBeenCalled();
  });

  it("si el privado falla (privados cerrados), sigue sin romperse", async () => {
    const { client, emitter, channel } = fakeClient();
    await new Herald(config).attach(client);
    emitter.emit(Events.GuildMemberAdd, fakeMember({ send: vi.fn().mockRejectedValue(new Error("Cannot send")) }));
    await flush();
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it("despedida con el nombre escapado y sin menciones", async () => {
    const { client, emitter, channel } = fakeClient();
    await new Herald(config).attach(client);
    emitter.emit(
      Events.GuildMemberRemove,
      fakeMember({ user: user({ bot: false, globalName: "*Bjorn*", username: "b" }) }),
    );
    await flush();
    const msg = channel.send.mock.calls[0]?.[0] as {
      allowedMentions: unknown;
      embeds: { toJSON(): { description?: string; image?: { url: string } } }[];
    };
    const embed = msg.embeds[0]?.toJSON();
    expect(embed?.description).toContain("\\*Bjorn\\*");
    expect(embed?.image?.url).toBe("attachment://despedida.gif");
    expect(msg.allowedMentions).toEqual({ parse: [] });
  });

  it("anuncia un boost nuevo, no una actualización cualquiera", async () => {
    const { client, emitter, channel } = fakeClient();
    await new Herald(config).attach(client);
    emitter.emit(Events.GuildMemberUpdate, fakeMember(), fakeMember({ premiumSince: null }));
    emitter.emit(Events.GuildMemberUpdate, fakeMember(), fakeMember({ premiumSince: new Date() }));
    await flush();
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect((channel.send.mock.calls[0]?.[0] as { content: string }).content).toContain("3 ofrendas (nivel 1)");
  });
});

describe("utilidades del heraldo", () => {
  it("isNewBoost", () => {
    expect(isNewBoost({ premiumSince: null }, { premiumSince: new Date() })).toBe(true);
    expect(isNewBoost({ premiumSince: new Date() }, { premiumSince: new Date() })).toBe(false);
  });

  it("solo pide el intent de miembros si hay algo del heraldo configurado", () => {
    expect(heraldNeedsMembers(loadConfig(base))).toBe(false);
    expect(heraldNeedsMembers(loadConfig({ ...base, AUTO_ROLE_ID: "300000000000000001" }))).toBe(true);
    expect(heraldNeedsMembers(config)).toBe(true);
  });
});
