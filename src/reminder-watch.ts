/**
 * Entrega de recordatorios: cada 30 s mira los vencidos y los envía. Lo que venció
 * con Skald apagado sale al arrancar, con una nota de retraso. Cada uno se intenta
 * una vez: si no se puede entregar, se marca con el motivo (y queda en el log).
 */
import { GuildScheduledEventStatus, time, TimestampStyles, type Client } from "discord.js";
import type { Reminder, Reminders } from "./core/reminders.js";
import { asset } from "./util/assets.js";
import { baseEmbed } from "./util/embeds.js";
import { log } from "./util/log.js";
import { texts } from "./util/texts.js";

const t = texts.recordatorio;
const CHECK_MS = 30_000;
/** A partir de aquí se avisa de que llega tarde. */
const LATE_MS = 10 * 60_000;
/** Menciones como mucho en el aviso de una quedada. */
const MAX_MENTIONS = 50;

export function startReminderWatch(client: Client<true>, reminders: Reminders): () => void {
  let busy = false;
  const check = async () => {
    if (busy) return;
    busy = true;
    try {
      for (const r of reminders.due()) {
        try {
          await deliver(client, r);
          reminders.done(r.id);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          log.warn(`Recordatorio #${r.id} sin entregar: ${reason}`);
          reminders.done(r.id, reason.slice(0, 200));
        }
      }
    } finally {
      busy = false;
    }
  };
  void check();
  const timer = setInterval(() => void check(), CHECK_MS);
  return () => {
    clearInterval(timer);
  };
}

export async function deliver(client: Client<true>, r: Reminder): Promise<void> {
  const late = Date.now() - r.dueAt.getTime() > LATE_MS;
  if (r.kind === "event") {
    await deliverEventNotice(client, r);
    return;
  }

  const mention = `<@${r.userId}>`;
  const lines = [r.kind === "user" ? t.forUser(mention) : t.fromUser(mention), "", r.text];
  if (late) lines.push("", t.late);
  const embed = baseEmbed().setTitle(t.title).setDescription(lines.join("\n"));
  const image = asset("reloj.gif");
  if (image) embed.setThumbnail(image.url);
  const files = image ? [image.file] : [];

  if (r.kind === "user") {
    try {
      const user = await client.users.fetch(r.userId);
      await user.send({ embeds: [embed], files, allowedMentions: { parse: [] } });
      return;
    } catch {
      // Privados cerrados: se le recuerda en el canal donde lo pidió, mencionándolo solo a él.
    }
  }
  const channel = await client.channels.fetch(r.channelId);
  if (!channel?.isSendable()) throw new Error("canal no disponible");
  await channel.send({
    ...(r.kind === "user" ? { content: mention } : {}),
    embeds: [embed],
    files,
    allowedMentions: { users: r.kind === "user" ? [r.userId] : [] },
  });
}

/** 30 min antes de una quedada: aviso en su canal mencionando a los interesados. */
async function deliverEventNotice(client: Client<true>, r: Reminder): Promise<void> {
  if (!r.eventId) return;
  const guild = await client.guilds.fetch(r.guildId);
  const event = await guild.scheduledEvents.fetch(r.eventId).catch(() => null);
  // Borrada, cancelada o ya empezada: no hay nada que avisar.
  if (!event?.scheduledStartAt || event.status !== GuildScheduledEventStatus.Scheduled) return;
  const subscribers = await event.fetchSubscribers({ limit: MAX_MENTIONS });
  const ids = [...subscribers.keys()];
  const channel = await client.channels.fetch(r.channelId);
  if (!channel?.isSendable()) throw new Error("canal no disponible");
  const content = [
    texts.quedada.soon(event.name, time(event.scheduledStartAt, TimestampStyles.RelativeTime)),
    ids.length > 0 ? ids.map((id) => `<@${id}>`).join(" ") : texts.quedada.soonNobody,
    event.url,
  ].join("\n");
  await channel.send({ content, allowedMentions: { users: ids } });
}
