import path from "node:path";
import { z } from "zod";

/** ID de Discord (snowflake): 17-20 dígitos. */
const snowflake = z.string().regex(/^\d{17,20}$/, "debe ser un ID de Discord (solo dígitos)");

const port = z.coerce.number().int().min(1).max(65535);

export const ALERT_EVENT_TYPES = ["join", "leave", "death", "advancement", "server"] as const;
export type AlertEventType = (typeof ALERT_EVENT_TYPES)[number];

const alertEventList = z
  .string()
  .default(ALERT_EVENT_TYPES.join(","))
  .transform((raw) =>
    raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0),
  )
  .pipe(z.array(z.enum(ALERT_EVENT_TYPES)));

const snowflakeList = z
  .string()
  .default("")
  .transform((raw) =>
    raw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  )
  .pipe(z.array(snowflake));

/** Lo mínimo para hablar con Discord (lo usa también el registro de comandos). */
export const discordSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "obligatorio"),
  DISCORD_GUILD_ID: snowflake,
});

export const configSchema = discordSchema.extend({
  // Canal de avisos. Sin él, no se avisa (pero /saga funciona).
  ALERT_CHANNEL_ID: snowflake.optional(),
  // Qué avisar: join, leave, death, advancement, server (separados por comas).
  ALERT_EVENTS: alertEventList,
  // Canal propio para un tipo de aviso (si no, va a ALERT_CHANNEL_ID).
  ALERT_CHANNEL_JOIN: snowflake.optional(),
  ALERT_CHANNEL_LEAVE: snowflake.optional(),
  ALERT_CHANNEL_DEATH: snowflake.optional(),
  ALERT_CHANNEL_ADVANCEMENT: snowflake.optional(),
  ALERT_CHANNEL_SERVER: snowflake.optional(),
  // Canales donde se pueden usar los comandos (vacío = todos). El de administración siempre.
  COMMAND_CHANNEL_IDS: snowflakeList,
  ADMIN_USER_IDS: snowflakeList,

  // Skald en el chat del juego (tellraw y comandos con «!»). Apagado por defecto.
  GAME_CHAT_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Canal donde se publican las quedadas y encuestas creadas desde el juego (si no, el primero de COMMAND_CHANNEL_IDS).
  GAME_CHAT_CHANNEL_ID: snowflake.optional(),

  // Panel del reino: mensaje fijo que Skald mantiene al día (opcional).
  PANEL_CHANNEL_ID: snowflake.optional(),

  // Canal privado de administración (avisos internos, p. ej. copias de seguridad).
  ADMIN_CHANNEL_ID: snowflake.optional(),
  // Antigüedad máxima de la última copia antes de avisar (la de mc-backup es diaria).
  BACKUP_MAX_AGE_HOURS: z.coerce.number().min(1).max(24 * 30).default(26),

  // Heraldo: bienvenidas, despedidas y boosts (canal), runas y rol automático.
  HERALD_CHANNEL_ID: snowflake.optional(),
  RULES_CHANNEL_ID: snowflake.optional(),
  AUTO_ROLE_ID: snowflake.optional(),
  // Rol de quien juega (Einherjar): activa la unión al reino (botón en las runas).
  PLAYER_ROLE_ID: snowflake.optional(),
  // Dirección del servidor de Minecraft que se enseña en las runas (opcional).
  MC_PUBLIC_ADDRESS: z.string().trim().min(1).max(100).optional(),

  MC_HOST: z.string().min(1).default("minecraft"),
  MC_PORT: port.default(25565),
  RCON_HOST: z.string().min(1).default("minecraft"),
  RCON_PORT: port.default(25575),
  RCON_PASSWORD: z.string().min(1, "obligatorio"),
  RCON_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(3000),

  // Enlace de /mapa (opcional).
  BLUEMAP_URL: z.url({ protocol: /^https?$/ }).optional(),

  DATA_DIR: z.string().min(1).default("/data"),
  BACKUPS_DIR: z.string().min(1).default("/backups"),
  // Estado propio de Skald (escribible; nunca dentro de DATA_DIR).
  STATE_DIR: z.string().min(1).default("/state"),
  // Zona horaria para «el día» (topes diarios de monedas...), p. ej. Europe/Madrid.
  TIMEZONE: z
    .string()
    .default("UTC")
    .refine((tz) => isTimeZone(tz), "zona horaria desconocida (p. ej. Europe/Madrid)"),
  // Economía: monedas por jugar (apagada por defecto).
  ECONOMY_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
}).refine((c) => !isInside(c.STATE_DIR, c.DATA_DIR), {
  // El mundo es sagrado: Skald nunca escribe en él.
  message: "no puede estar dentro de DATA_DIR",
  path: ["STATE_DIR"],
});

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export type DiscordConfig = z.infer<typeof discordSchema>;
export type Config = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  override name = "ConfigError";
}

/**
 * Valida las variables de entorno. Si algo falla lanza ConfigError con la lista
 * de variables problemáticas, sin incluir nunca sus valores (pueden ser secretos).
 */
function parseEnv<S extends z.ZodType>(schema: S, env: NodeJS.ProcessEnv): z.infer<S> {
  // Las variables vacías («RCON_PASSWORD=») cuentan como no definidas.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    const key = issue.path.join(".") || "(entorno)";
    const reason = issue.code === "invalid_type" ? "obligatorio" : issue.message;
    return `  - ${key}: ${reason}`;
  });
  throw new ConfigError(`Configuración no válida:\n${lines.join("\n")}`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return parseEnv(configSchema, env);
}

export function loadDiscordConfig(env: NodeJS.ProcessEnv = process.env): DiscordConfig {
  return parseEnv(discordSchema, env);
}
