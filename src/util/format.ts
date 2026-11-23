import type { MetricUnit } from "../core/metrics.js";

const LOCALE = "es-ES";

export function formatCount(n: number): string {
  return n.toLocaleString(LOCALE, { maximumFractionDigits: 1 });
}

/** Ticks de juego → "3 d 4 h", "5 h 20 min", "12 min". */
export function formatDuration(ticks: number): string {
  const totalMinutes = Math.floor(ticks / 20 / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${formatCount(days)} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

/** Centímetros → "45,3 km" o "850 m". */
export function formatDistance(cm: number): string {
  const km = cm / 100_000;
  return km >= 1 ? `${formatCount(km)} km` : `${Math.round(cm / 100)} m`;
}

/** Bytes → "870,1 MB", "4,9 GB". */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} ${units[unit] ?? "B"}`;
}

export function formatMetric(unit: MetricUnit, value: number): string {
  switch (unit) {
    case "ticks":
      return formatDuration(value);
    case "cm":
      return formatDistance(value);
    case "count":
      return formatCount(value);
  }
}
