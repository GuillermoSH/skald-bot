/**
 * Unión al reino (vinculación Discord ↔ Minecraft) y rango Einherjar.
 *
 * Flujo: botón «Acepto las runas» en el mensaje de las runas → formulario con el
 * nombre de Minecraft → Skald lo busca en Mojang y pide confirmación (todo en
 * mensajes que solo ve esa persona) → se guarda. Si ya ha jugado alguna vez, es
 * Einherjar al momento; si no, en cuanto entre al servidor (se ve en el log).
 *
 * Roles en lista cerrada: solo se añade `PLAYER_ROLE_ID` (Einherjar) y se quita
 * `AUTO_ROLE_ID` (Viajero). Nunca otro rol, nunca a un bot.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type Guild,
  type ModalSubmitInteraction,
} from "discord.js";
import type { Config } from "./config.js";
import type { Link, Links } from "./core/links.js";
import { dashedUuid, MojangUnavailableError, type MojangClient } from "./core/mojang.js";
import type { NameResolver } from "./core/names.js";
import type { WorldStats } from "./core/stats.js";
import { asset } from "./util/assets.js";
import { baseEmbed } from "./util/embeds.js";
import { isValidPlayerName, safeText } from "./util/escape.js";
import { log } from "./util/log.js";
import { texts } from "./util/texts.js";

const t = texts.link;

export const LINK_PREFIX = "skald:link:";
const START_ID = `${LINK_PREFIX}start`;
const MODAL_ID = `${LINK_PREFIX}name`;
const NAME_INPUT_ID = "name";
const CONFIRM_RE = /^skald:link:ok:([0-9a-f]{32}):(\w{3,16})$/;
const CANCEL_ID = `${LINK_PREFIX}no`;

/** Botón para el mensaje de las runas. */
export function linkButtonRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(START_ID).setLabel(t.button).setEmoji("📜").setStyle(ButtonStyle.Success),
  );
}

export type AdminNotice = (message: string) => Promise<void>;

/** Si nadie ha entrado en este tiempo, el servidor está parado: no se degrada a nadie. */
const QUIET_SERVER_MS = 7 * 86_400_000;
const MAX_INACTIVE_PER_RUN = 10;

export class Linking {
  constructor(
    private readonly config: Config & { PLAYER_ROLE_ID: string },
    private readonly links: Links,
    private readonly mojang: MojangClient,
    private readonly names: NameResolver,
    private readonly world: WorldStats,
    private readonly notify: AdminNotice,
  ) {}

  /** Rol para alguien que (re)entra al servidor de Discord: Einherjar si ya lo era. */
  roleOnJoin(discordId: string): string | null {
    return this.links.byDiscord(discordId)?.status === "active" ? this.config.PLAYER_ROLE_ID : (this.config.AUTO_ROLE_ID ?? null);
  }

  // ---- interacciones

  async handle(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<void> {
    if (interaction.guildId !== this.config.DISCORD_GUILD_ID) return;
    const id = interaction.customId;
    if (interaction.isButton()) {
      if (id === START_ID) return this.onStart(interaction);
      if (id === CANCEL_ID) {
        await interaction.update({ content: t.cancelled, embeds: [], components: [] });
        return;
      }
      const m = CONFIRM_RE.exec(id);
      if (m) return this.onConfirm(interaction, m[1] ?? "", m[2] ?? "");
    } else if (id === MODAL_ID) {
      return this.onName(interaction);
    }
  }

  private async onStart(interaction: ButtonInteraction): Promise<void> {
    const existing = this.links.byDiscord(interaction.user.id);
    if (existing) {
      await interaction.reply({ content: t.alreadyLinked(safeText(existing.mcName, 16)), flags: MessageFlags.Ephemeral });
      return;
    }
    const input = new TextInputBuilder().setCustomId(NAME_INPUT_ID).setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(16).setRequired(true);
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(MODAL_ID)
        .setTitle(t.modalTitle)
        .addLabelComponents(new LabelBuilder().setLabel(t.modalLabel).setDescription(t.modalDescription).setTextInputComponent(input)),
    );
  }

  private async onName(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const name = interaction.fields.getTextInputValue(NAME_INPUT_ID).trim();
    if (!isValidPlayerName(name)) {
      await interaction.editReply({ content: t.invalidName });
      return;
    }
    let profile;
    try {
      profile = await this.mojang.lookup(name);
    } catch (error) {
      if (!(error instanceof MojangUnavailableError)) throw error;
      log.warn(`Mojang no responde: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`);
      await interaction.editReply({ content: t.mojangDown });
      return;
    }
    if (!profile) {
      await interaction.editReply({ content: t.notFound(safeText(name, 16)) });
      return;
    }
    const other = this.links.byUuid(profile.uuid);
    if (other && other.discordId !== interaction.user.id) {
      await interaction.editReply({ content: t.uuidTaken });
      await this.notify(t.adminConflict(`<@${interaction.user.id}>`, safeText(profile.name, 16), `<@${other.discordId}>`));
      return;
    }
    const embed = baseEmbed()
      .setTitle(t.confirmTitle)
      .setDescription(t.confirmBody(safeText(profile.name, 16)))
      .setThumbnail(`https://mc-heads.net/avatar/${profile.uuid}/64`);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${LINK_PREFIX}ok:${profile.uuid.replaceAll("-", "")}:${profile.name}`)
        .setLabel(t.confirm)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(CANCEL_ID).setLabel(t.cancel).setStyle(ButtonStyle.Secondary),
    );
    await interaction.editReply({ embeds: [embed], components: [row] });
  }

  private async onConfirm(interaction: ButtonInteraction, uuidHex: string, name: string): Promise<void> {
    const guild = interaction.guild;
    if (!guild) return;
    const result = await this.link(guild, interaction.user.id, uuidHex, name, null);
    const content =
      result.kind === "discord_taken"
        ? t.alreadyLinked(safeText(result.link.mcName, 16))
        : result.kind === "uuid_taken"
          ? t.uuidTaken
          : result.link.status === "active"
            ? t.linkedActive(safeText(name, 16))
            : t.linkedPending(safeText(name, 16));
    await interaction.update({ content, embeds: [], components: [] });
  }

  // ---- vinculación (también para /vincular)

  async link(
    guild: Guild,
    discordId: string,
    uuidHex: string,
    name: string,
    adminId: string | null,
  ): Promise<{ kind: "ok"; link: Link } | { kind: "discord_taken"; link: Link } | { kind: "uuid_taken"; link: Link }> {
    const uuid = dashedUuid(uuidHex);
    const mine = this.links.byDiscord(discordId);
    if (mine) return { kind: "discord_taken", link: mine };
    const other = this.links.byUuid(uuid);
    if (other) return { kind: "uuid_taken", link: other };

    let link = this.links.create(discordId, uuid, name, adminId);
    // ¿Ya ha jugado alguna vez? (tiene estadísticas en el mundo)
    const played = await this.world
      .players()
      .then((ps) => ps.some((p) => p.uuid.toLowerCase() === uuid))
      .catch(() => false);
    if (played && (await this.promote(guild, discordId))) {
      this.links.activate(discordId);
      link = this.links.byDiscord(discordId) ?? link;
    }
    const status = link.status === "active" ? t.statusActive : t.statusPending;
    const user = `<@${discordId}>`;
    await this.notify(adminId ? t.adminLinkedBy(user, safeText(name, 16), `<@${adminId}>`, status) : t.adminLinked(user, safeText(name, 16), status));
    log.info(`Vinculación: ${discordId} → ${name} (${link.status})`);
    return { kind: "ok", link };
  }

  async unlink(discordId: string, adminId: string): Promise<Link | null> {
    const link = this.links.remove(discordId);
    if (link) {
      log.info(`Desvinculado: ${discordId} (${link.mcName})`);
      await this.notify(t.adminUnlinked(`<@${discordId}>`, safeText(link.mcName, 16), `<@${adminId}>`));
    }
    return link;
  }

  /** Alguien ha entrado al servidor de Minecraft (desde el log). */
  async onPlayerJoin(client: Client<true>, playerName: string): Promise<void> {
    this.names.invalidate();
    const uuid = await this.names.uuidOf(playerName);
    if (!uuid) return;
    const link = this.links.byUuid(uuid);
    if (!link) return;
    this.links.seen(uuid, playerName);
    // Pendiente (primera vez) o inactivo (vuelve): pasa a Einherjar. Exiliado: nunca solo.
    if (link.status !== "pending" && link.status !== "inactive") return;
    const returning = link.status === "inactive";

    const guild = await client.guilds.fetch(this.config.DISCORD_GUILD_ID);
    if (!(await this.promote(guild, link.discordId))) return;
    this.links.activate(link.discordId);
    log.info(`Einherjar${returning ? " (vuelve)" : ""}: ${playerName} (${link.discordId})`);
    const user = `<@${link.discordId}>`;
    const name = safeText(playerName, 16);
    await this.notify(returning ? t.adminReturned(user, name) : t.adminPromoted(user, name));

    const image = asset("einherjar.gif");
    const embed = baseEmbed()
      .setTitle(returning ? t.returnTitle : t.promotedTitle)
      .setDescription(returning ? t.returnBody(name) : t.promotedBody(name));
    if (image) embed.setImage(image.url);
    await client.users
      .send(link.discordId, { embeds: [embed], files: image ? [image.file] : [], allowedMentions: { parse: [] } })
      .catch(() => {
        log.debug(`No se pudo avisar por privado a ${link.discordId} de que es Einherjar`);
      });
  }

  /** Alguien ha salido del servidor: es su última conexión. */
  async onPlayerLeave(playerName: string): Promise<void> {
    const uuid = await this.names.uuidOf(playerName);
    if (uuid) this.links.seen(uuid, playerName);
  }

  /**
   * Inactividad: quien lleva `days` días sin entrar vuelve a Viajero (con un privado,
   * una sola vez). Salvaguardas: si nadie ha entrado en una semana (servidor caído,
   * vacaciones) no se toca a nadie, y como mucho `MAX_INACTIVE_PER_RUN` por pasada.
   */
  async checkInactivity(client: Client<true>, days: number, now = new Date()): Promise<number> {
    if (days <= 0) return 0;
    const players = await this.world.players().catch(() => []);
    const savedAt = new Map(players.map((p) => [p.uuid.toLowerCase(), p.savedAt?.getTime() ?? 0]));
    const lastActivity = (l: Link) => Math.max(l.lastSeen ? Date.parse(l.lastSeen) : 0, savedAt.get(l.uuid) ?? 0);

    const latest = Math.max(this.links.latestSeen()?.getTime() ?? 0, ...savedAt.values());
    if (now.getTime() - latest > QUIET_SERVER_MS) {
      log.debug("Inactividad: nadie ha entrado en una semana; no se degrada a nadie");
      return 0;
    }

    const limit = now.getTime() - days * 86_400_000;
    const stale = this.links
      .active()
      .filter((l) => !this.config.ADMIN_USER_IDS.includes(l.discordId))
      .filter((l) => {
        const at = lastActivity(l);
        return at > 0 && at < limit; // sin ningún dato, mejor no tocarlo
      })
      .slice(0, MAX_INACTIVE_PER_RUN);
    if (stale.length === 0) return 0;

    const guild = await client.guilds.fetch(this.config.DISCORD_GUILD_ID);
    for (const link of stale) {
      await this.demote(guild, link.discordId);
      this.links.deactivate(link.discordId);
      const user = `<@${link.discordId}>`;
      const name = safeText(link.mcName, 16);
      log.info(`Inactivo: ${link.mcName} (${link.discordId}) vuelve a Viajero`);
      const image = asset("despedida.gif");
      const embed = baseEmbed().setTitle(t.inactiveTitle).setDescription(t.inactiveBody(name, days));
      if (image) embed.setImage(image.url);
      const dm = await client.users
        .send(link.discordId, { embeds: [embed], files: image ? [image.file] : [], allowedMentions: { parse: [] } })
        .then(() => true)
        .catch(() => false);
      await this.notify(`${t.adminInactive(user, name, days)}${dm ? "" : `\n${t.adminInactiveNoDm(user)}`}`);
    }
    return stale.length;
  }

  /** Quita Einherjar y devuelve Viajero (si sigue en el servidor de Discord). */
  private async demote(guild: Guild, discordId: string): Promise<void> {
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member || member.user.bot) return;
    try {
      const viajero = this.config.AUTO_ROLE_ID;
      if (viajero) await member.roles.add(viajero, "Inactivo: vuelve a Viajero");
      if (member.roles.cache.has(this.config.PLAYER_ROLE_ID)) await member.roles.remove(this.config.PLAYER_ROLE_ID, "Inactivo");
    } catch (error) {
      log.warn(`No se pudo devolver a Viajero a ${discordId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Da Einherjar y quita Viajero. false si no se pudo (no está en el servidor, permisos...). */
  private async promote(guild: Guild, discordId: string): Promise<boolean> {
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member || member.user.bot) return false;
    try {
      await member.roles.add(this.config.PLAYER_ROLE_ID, "Unido al reino: ha entrado al servidor");
      const viajero = this.config.AUTO_ROLE_ID;
      if (viajero && member.roles.cache.has(viajero)) await member.roles.remove(viajero, "Ya es Einherjar");
      return true;
    } catch (error) {
      log.warn(
        `No se pudo dar Einherjar a ${discordId} (¿Skald está por encima del rol y tiene «Gestionar roles»?): ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
