/**
 * Skald como heraldo del servidor de Discord: bienvenidas, despedidas y boosts
 * en un canal, mensaje privado con las runas y rol automático al entrar.
 * Requiere el «Server Members Intent» activado en el portal de Discord.
 */
import {
  EmbedBuilder,
  Events,
  type Client,
  type GuildMember,
  type MessageCreateOptions,
  type PartialGuildMember,
  type SendableChannels,
} from "discord.js";
import type { Config } from "./config.js";
import { asset } from "./util/assets.js";
import { fetchSendableChannel } from "./util/channels.js";
import { COLORS } from "./util/embeds.js";
import { safeText } from "./util/escape.js";
import { log } from "./util/log.js";
import { texts } from "./util/texts.js";

/** El heraldo necesita los eventos de miembros si hay algo que hacer con ellos. */
export function heraldNeedsMembers(config: Config): boolean {
  return Boolean(config.HERALD_CHANNEL_ID ?? config.AUTO_ROLE_ID ?? config.RULES_CHANNEL_ID);
}

/** Un miembro acaba de mejorar el servidor (antes no tenía boost, ahora sí). */
export function isNewBoost(before: { premiumSince: Date | null }, after: { premiumSince: Date | null }): boolean {
  return before.premiumSince === null && after.premiumSince !== null;
}

export function displayName(member: GuildMember | PartialGuildMember): string {
  return member.user.globalName ?? member.user.username;
}

/** Embed con imagen (si está en assets/) y avatar del miembro. */
function decorated(
  member: GuildMember | PartialGuildMember,
  image: string,
  build: (embed: EmbedBuilder) => EmbedBuilder,
): Pick<MessageCreateOptions, "embeds" | "files"> {
  const embed = build(new EmbedBuilder().setColor(COLORS.main)).setThumbnail(
    member.user.displayAvatarURL({ size: 256 }),
  );
  const img = asset(image);
  if (img) embed.setImage(img.url);
  return { embeds: [embed], files: img ? [img.file] : [] };
}

export class Herald {
  private channel: SendableChannels | null = null;
  private welcomeIndex = 0;
  private farewellIndex = 0;

  constructor(private readonly config: Config) {}

  async attach(client: Client<true>): Promise<void> {
    const { HERALD_CHANNEL_ID, AUTO_ROLE_ID } = this.config;
    if (HERALD_CHANNEL_ID) this.channel = await fetchSendableChannel(client, HERALD_CHANNEL_ID, "heraldo");

    const guard = (what: string, task: () => Promise<void>) => {
      task().catch((error: unknown) => {
        log.warn(`Heraldo (${what}): ${error instanceof Error ? error.message : String(error)}`);
      });
    };
    client.on(Events.GuildMemberAdd, (member) => {
      guard("entrada", () => this.onJoin(member));
    });
    client.on(Events.GuildMemberRemove, (member) => {
      guard("salida", () => this.onLeave(member));
    });
    client.on(Events.GuildMemberUpdate, (before, after) => {
      guard("boost", () => this.onUpdate(before, after));
    });

    log.info(
      `Heraldo activo (canal: ${this.channel ? "sí" : "no"}, rol automático: ${AUTO_ROLE_ID ? "sí" : "no"}, runas por privado: ${this.config.RULES_CHANNEL_ID ? "sí" : "no"})`,
    );
  }

  private isOurs(member: GuildMember | PartialGuildMember): boolean {
    return member.guild.id === this.config.DISCORD_GUILD_ID && !member.user.bot;
  }

  private async onJoin(member: GuildMember): Promise<void> {
    if (!this.isOurs(member)) return;
    const { AUTO_ROLE_ID, RULES_CHANNEL_ID } = this.config;

    let roleName: string | null = null;
    if (AUTO_ROLE_ID) {
      // Lista cerrada: solo el rol configurado, y solo se añade.
      roleName = await member.roles
        .add(AUTO_ROLE_ID, "Rol automático de bienvenida")
        .then(() => member.guild.roles.cache.get(AUTO_ROLE_ID)?.name ?? null)
        .catch((error: unknown) => {
          log.warn(
            `No se pudo dar el rol automático (¿Skald está por encima del rol y tiene «Gestionar roles»?): ${error instanceof Error ? error.message : String(error)}`,
          );
          return null;
        });
    }

    if (this.channel) {
      const rules = RULES_CHANNEL_ID ? `<#${RULES_CHANNEL_ID}>` : texts.herald.rulesFallback;
      const jarlId = this.config.ADMIN_USER_IDS[0];
      const phrases = texts.herald.welcome;
      const phrase = phrases[this.welcomeIndex++ % phrases.length] ?? phrases[0];
      await this.channel.send({
        content: phrase(member.toString(), rules),
        ...decorated(member, "bienvenida.gif", (e) =>
          e
            .setTitle(texts.herald.welcomeTitle)
            .setDescription(
              texts.herald.welcomeLines({
                role: roleName ? safeText(roleName, 50) : null,
                rules,
                jarl: jarlId ? `<@${jarlId}>` : null,
              }),
            )
            .setFooter({ text: texts.herald.memberNumber(member.guild.memberCount) }),
        ),
        // Solo se notifica al recién llegado (la mención del Jarl va en el embed, sin notificar).
        allowedMentions: { users: [member.id] },
      });
    }

    const rulesUrl = RULES_CHANNEL_ID ? `https://discord.com/channels/${member.guild.id}/${RULES_CHANNEL_ID}` : null;
    // Si tiene los privados cerrados, no pasa nada.
    await member
      .send({
        content: texts.herald.dm(safeText(displayName(member), 32), safeText(member.guild.name, 100), rulesUrl),
        allowedMentions: { parse: [] },
      })
      .catch(() => {
        log.debug(`No se pudo enviar el privado de bienvenida a ${member.id}`);
      });
  }

  private async onLeave(member: GuildMember | PartialGuildMember): Promise<void> {
    if (!this.isOurs(member) || !this.channel) return;
    const phrases = texts.herald.farewell;
    const phrase = phrases[this.farewellIndex++ % phrases.length] ?? phrases[0];
    await this.channel.send({
      ...decorated(member, "despedida.gif", (e) =>
        e.setTitle(texts.herald.farewellTitle).setDescription(phrase(safeText(displayName(member), 32))),
      ),
      allowedMentions: { parse: [] },
    });
  }

  private async onUpdate(before: GuildMember | PartialGuildMember, after: GuildMember): Promise<void> {
    if (!this.channel || after.guild.id !== this.config.DISCORD_GUILD_ID) return;
    // Sin datos previos (miembro no cacheado) no se puede saber si el boost es nuevo.
    if (before.partial || !isNewBoost(before, after)) return;
    const guild = after.guild;
    await this.channel.send({
      content: texts.herald.boost(after.toString(), guild.premiumSubscriptionCount ?? 0, guild.premiumTier),
      ...decorated(after, "ofrenda.gif", (e) => e.setTitle(texts.herald.boostTitle).setColor(COLORS.ok)),
      allowedMentions: { users: [after.id] },
    });
  }
}
