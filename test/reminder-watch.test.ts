import type { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { Reminder } from "../src/core/reminders.js";
import { deliver } from "../src/reminder-watch.js";

const reminder = (over: Partial<Reminder>): Reminder => ({
  id: 1,
  kind: "user",
  guildId: "g",
  channelId: "c",
  userId: "123456789012345678",
  text: "@everyone regar los cultivos",
  dueAt: new Date(),
  createdAt: new Date(),
  eventId: null,
  ...over,
});

function fakeClient(dmFails: boolean) {
  type Send = (payload: unknown) => Promise<void>;
  const dm = vi.fn<Send>(() => (dmFails ? Promise.reject(new Error("privados cerrados")) : Promise.resolve()));
  const channelSend = vi.fn<Send>(() => Promise.resolve());
  const client = {
    users: { fetch: () => Promise.resolve({ send: dm }) },
    channels: { fetch: () => Promise.resolve({ isSendable: () => true, send: channelSend }) },
  } as unknown as Client<true>;
  return { client, dm, channelSend };
}

describe("entrega de recordatorios", () => {
  it("personal: por privado, sin mencionar a nadie", async () => {
    const { client, dm, channelSend } = fakeClient(false);
    await deliver(client, reminder({}));
    expect(dm).toHaveBeenCalledOnce();
    expect(dm.mock.calls[0]?.[0]).toMatchObject({ allowedMentions: { parse: [] } });
    expect(channelSend).not.toHaveBeenCalled();
  });

  it("privados cerrados: en el canal, mencionando solo a esa persona", async () => {
    const { client, channelSend } = fakeClient(true);
    await deliver(client, reminder({}));
    expect(channelSend.mock.calls[0]?.[0]).toMatchObject({
      content: "<@123456789012345678>",
      allowedMentions: { users: ["123456789012345678"] },
    });
  });

  it("de canal: sin menciones aunque el texto lleve @everyone", async () => {
    const { client, dm, channelSend } = fakeClient(false);
    await deliver(client, reminder({ kind: "channel" }));
    expect(dm).not.toHaveBeenCalled();
    expect(channelSend.mock.calls[0]?.[0]).toMatchObject({ allowedMentions: { users: [] } });
  });
});
