const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

let threshold: number = LEVELS.info;

export function setLogLevel(level: LogLevel): void {
  threshold = LEVELS[level];
}

function emit(level: LogLevel, message: string, extra?: unknown): void {
  if (LEVELS[level] < threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const out = level === "error" || level === "warn" ? console.error : console.log;
  if (extra === undefined) out(line);
  else out(line, extra);
}

export const log = {
  debug: (msg: string, extra?: unknown) => { emit("debug", msg, extra); },
  info: (msg: string, extra?: unknown) => { emit("info", msg, extra); },
  warn: (msg: string, extra?: unknown) => { emit("warn", msg, extra); },
  error: (msg: string, extra?: unknown) => { emit("error", msg, extra); },
};
