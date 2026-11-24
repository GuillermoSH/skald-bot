/** Búsqueda y autocompletado de guerreros, compartidos por los comandos que piden uno. */
import type { AutocompleteInteraction } from "discord.js";
import type { PlayerRecord } from "../core/stats.js";
import type { CommandContext } from "./types.js";

/** Sugerencias con los nombres ya conocidos (sin ir a la red: hay 3 s para responder). */
export async function autocompletePlayers(interaction: AutocompleteInteraction, { world, names }: CommandContext): Promise<void> {
  const typed = interaction.options.getFocused().toLowerCase();
  const players = await world.players();
  const known = await names.peek(players.map((p) => p.uuid));
  const choices = [...known.values()]
    .filter((name) => name.toLowerCase().includes(typed))
    .sort((a, b) => a.localeCompare(b, "es"))
    .slice(0, 25)
    .map((name) => ({ name, value: name }));
  await interaction.respond(choices);
}

/** El jugador con ese nombre (sin distinguir mayúsculas), o null. */
export async function findPlayer(
  requested: string,
  { world, names }: CommandContext,
): Promise<{ player: PlayerRecord; name: string } | null> {
  const players = await world.players();
  const resolved = await names.resolve(players.map((p) => p.uuid));
  const wanted = requested.toLowerCase();
  for (const player of players) {
    const name = resolved.get(player.uuid);
    if (name?.toLowerCase() === wanted) return { player, name };
  }
  return null;
}
