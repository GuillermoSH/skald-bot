import type {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import type { Config } from "../config.js";
import type { RconClient } from "../core/rcon.js";

export interface CommandContext {
  config: Config;
  rcon: RconClient;
}

export interface Command {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  /** Si la respuesta solo la ve quien lanza el comando. */
  ephemeral?: boolean;
  /** La interacción ya llega con `deferReply` hecho: hay que usar `editReply`. */
  execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void>;
}
