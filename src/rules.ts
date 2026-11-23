/**
 * Mensaje fijo de las runas (normas, canales, cómo entrar). Skald lo publica
 * una vez y, si el texto cambia en texts.ts, edita su propio mensaje en vez de
 * publicar otro. Lo reconoce por el pie (`texts.rules.footer`): si se cambia el
 * pie, publicará uno nuevo (y el viejo habrá que borrarlo a mano).
 *
 * Jerarquía visual con Markdown de Discord dentro de los embeds: portada con la
 * imagen, cabeceras (# ## ###), pasos numerados y la dirección en un bloque de código.
 */
import { ChannelType, EmbedBuilder, type APIEmbed, type Client } from "discord.js";
import { asset } from "./util/assets.js";
import { fetchSendableChannel } from "./util/channels.js";
import { COLORS } from "./util/embeds.js";
import { log } from "./util/log.js";
import { texts } from "./util/texts.js";

export interface RulesOptions {
  version: string | null;
  address: string | null;
  /** ID de Discord del Jarl (se menciona, sin notificar). */
  jarlId: string | null;
  /** `find` de cada canal de la guía → ID del canal encontrado (para enlazarlo). */
  channelIds?: ReadonlyMap<string, string>;
  /** `attachment://…` de la imagen de portada. */
  imageUrl?: string;
}

interface GuideChannel {
  find: string;
  label: string;
  description: string;
}

const guideChannels = (): GuideChannel[] =>
  texts.rules.groups.flatMap((g): readonly GuideChannel[] => g.channels);

/**
 * Busca en el servidor cada canal de la guía por su nombre (sin distinguir
 * mayúsculas). Los que no aparecen se quedan sin enlace.
 */
export function matchGuideChannels(
  channels: readonly { id: string; name: string; type: ChannelType }[],
): Map<string, string> {
  const found = new Map<string, string>();
  const candidates = channels.filter((c) => c.type !== ChannelType.GuildCategory);
  for (const { find } of guideChannels()) {
    const match = candidates.find((c) => c.name.toLowerCase().includes(find.toLowerCase()));
    if (match) found.set(find, match.id);
  }
  return found;
}

export function buildRulesEmbeds(options: RulesOptions): EmbedBuilder[] {
  const r = texts.rules;
  const embeds: EmbedBuilder[] = [];

  // Portada: solo la imagen, arriba del todo.
  if (options.imageUrl) embeds.push(new EmbedBuilder().setColor(COLORS.main).setImage(options.imageUrl));

  // Normas: cada una con su cabecera y la explicación debajo.
  const rules = r.list.map((rule, i) => `### ${r.numbers[i] ?? `${i + 1}.`} ${rule.title}\n${rule.text}`);
  embeds.push(new EmbedBuilder().setColor(COLORS.main).setDescription([r.intro, ...rules].join("\n")));

  // Salones, agrupados por categoría.
  const groups = r.groups.map((group) => {
    const lines = group.channels.map((c) => {
      const id = options.channelIds?.get(c.find);
      return `${id ? `<#${id}>` : c.label} · ${c.description}`;
    });
    return `### ${group.title}\n${lines.join("\n")}`;
  });
  embeds.push(new EmbedBuilder().setColor(COLORS.main).setDescription([r.channelsHeading, ...groups].join("\n")));

  // Cómo entrar: pasos numerados y la dirección destacada.
  const toJarl = options.jarlId ? `a <@${options.jarlId}>` : r.jarlFallback;
  const join = [
    r.joinHeading,
    r.joinIntro(options.version),
    "",
    ...r.joinSteps(toJarl).map((step, i) => `${i + 1}. ${step}`),
    ...(options.address ? [r.addressHeading, "```", options.address, "```"] : []),
  ];
  embeds.push(new EmbedBuilder().setColor(COLORS.ok).setDescription(join.join("\n")).setFooter({ text: r.footer }));
  return embeds;
}

/** Lo que importa para saber si el mensaje publicado está al día. */
function fingerprint(embeds: readonly APIEmbed[]): string {
  return JSON.stringify(
    embeds.map((e) => ({
      title: e.title ?? null,
      description: e.description ?? null,
      footer: e.footer?.text ?? null,
      image: e.image ? true : false,
    })),
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

  const guild = channel.isDMBased() ? null : channel.guild;
  const guildChannels = guild ? [...(await guild.channels.fetch()).values()].filter((c) => c !== null) : [];
  const channelIds = matchGuideChannels(guildChannels);
  const missing = guideChannels()
    .filter((c) => !channelIds.has(c.find))
    .map((c) => c.label);
  if (missing.length > 0) log.warn(`Runas: canales sin enlace (no encontrados por nombre): ${missing.join(", ")}`);

  const image = asset("runas.png");
  const embeds = buildRulesEmbeds({ ...options, channelIds, ...(image ? { imageUrl: image.url } : {}) });
  // `attachments: []` al editar sustituye la imagen anterior en vez de acumularlas.
  const payload = { embeds, files: image ? [image.file] : [], attachments: [], allowedMentions: { parse: [] } };
  const recent = await channel.messages.fetch({ limit: 50 });
  // Se reconoce por el pie, común a la versión antigua y a la nueva del mensaje.
  const existing = recent.find(
    (m) => m.author.id === client.user.id && m.embeds.some((e) => e.footer?.text === texts.rules.footer),
  );

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
