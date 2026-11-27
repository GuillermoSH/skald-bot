import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import type { Config } from "../config.js";
import type { Chronicle } from "../core/chronicle.js";
import type { DeathArchive } from "../core/deaths.js";
import type { Translator } from "../core/lang.js";
import type { NameResolver } from "../core/names.js";
import type { RconClient } from "../core/rcon.js";
import type { WorldStats } from "../core/stats.js";
import type { Linking } from "../linking.js";
import type { Roulette } from "../roulette.js";
import type { Realm } from "../realm.js";

export interface CommandContext {
  config: Config;
  rcon: RconClient;
  world: WorldStats;
  names: NameResolver;
  lang: Translator;
  chronicle: Chronicle;
  deaths: DeathArchive;
  realm: Realm;
  /** Unión al reino; null si no está configurada (sin PLAYER_ROLE_ID o sin base de datos). */
  linking: Linking | null;
  /** La ruleta; null si la economía está apagada. */
  roulette: Roulette | null;
}

export interface Command {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  /** Si la respuesta solo la ve quien lanza el comando. */
  ephemeral?: boolean;
  /** La interacción ya llega con `deferReply` hecho: hay que usar `editReply`. */
  execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void>;
  /** Sugerencias mientras se escribe una opción (hay 3 s para responder, sin defer). */
  autocomplete?(interaction: AutocompleteInteraction, ctx: CommandContext): Promise<void>;
}
