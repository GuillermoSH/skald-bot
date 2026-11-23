/**
 * Mensaje fijo de las runas (normas, canales, cómo entrar). Skald lo publica
 * una vez y, si el texto cambia en texts.ts, edita su propio mensaje en vez de
 * publicar otro. Lo reconoce por el título: si se cambia el título, publicará
 * uno nuevo (y el viejo habrá que borrarlo a mano).
 */
import { EmbedBuilder, type APIEmbed, type Client } from "discord.js";
import { fetchSendableChannel } from "./util/channels.js";
import { COLORS } from "./util/embeds.js";
import { log } from "./util/log.js";
import { texts } from "./util/texts.js";

export interface RulesOptions {
  version: string | null;
  address: string | null;
  /** ID de Discord del Jarl (se menciona, sin notificar). */
  jarlId: string | null;
}

export function buildRulesEmbeds(options: RulesOptions): EmbedBuilder[] {
  const r = texts.rules;
  return [
    new EmbedBuilder()
      .setColor(COLORS.main)
      .setTitle(r.title)
      .setDescription(`${r.intro}\n\n${r.list.map((rule, i) => `${i + 1}. ${rule}`).join("\n")}`),
    new EmbedBuilder()
      .setColor(COLORS.main)
      .setTitle(r.channelsTitle)
      .setDescription(r.channels.map((c) => `• ${c}`).join("\n")),
    new EmbedBuilder()
      .setColor(COLORS.ok)
      .setTitle(r.joinTitle)
      .setDescription(
        r.join({
          version: options.version,
          address: options.address,
          jarl: options.jarlId ? `<@${options.jarlId}>` : null,
        }),
      )
      .setFooter({ text: r.footer }),
  ];
}

/** Lo que importa para saber si el mensaje publicado está al día. */
function fingerprint(embeds: readonly APIEmbed[]): string {
  return JSON.stringify(
    embeds.map((e) => ({ title: e.title ?? null, description: e.description ?? null, footer: e.footer?.text ?? null })),
  );
}

export async function publishRules(client: Client<true>, channelId: string, options: RulesOptions): Promise<void> {
  const channel = await fetchSendableChannel(client, channelId, "runas", [
    "ViewChannel",
    "SendMessages",
    "EmbedLinks",
    "ReadMessageHistory",
  ]);
  if (!channel) return;

  const embeds = buildRulesEmbeds(options);
  const payload = { embeds, allowedMentions: { parse: [] } };
  const recent = await channel.messages.fetch({ limit: 50 });
  const existing = recent.find((m) => m.author.id === client.user.id && m.embeds[0]?.title === texts.rules.title);

  if (!existing) {
    await channel.send(payload);
    log.info("Runas publicadas");
  } else if (fingerprint(existing.embeds.map((e) => e.toJSON())) !== fingerprint(embeds.map((e) => e.toJSON()))) {
    await existing.edit(payload);
    log.info("Runas actualizadas");
  } else {
    log.debug("Runas al día");
  }
}
