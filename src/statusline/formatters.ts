import { basename } from "node:path";
import { TIME_INTERVALS } from "./constants";

/** Format a path: truncated (default), full, relative (~), or basename. */
export function formatPath(
  path: string,
  style: "truncated" | "full" | "relative" | "basename" = "truncated",
): string {
  const home = process.env.HOME || "";
  const isUnderHome = home !== "" && path.startsWith(home);
  const withTilde = isUnderHome ? path.replace(home, "~") : path;
  const parts = withTilde.split("/").filter(Boolean);
  const name = parts[parts.length - 1] || withTilde;
  switch (style) {
    case "full": return path;
    case "basename": return name;
    case "relative": return withTilde;
    default:
      if (isUnderHome && parts.length > 2) return `~/../${name}`;
      if (isUnderHome) return withTilde;
      if (parts.length > 3) return `/../${name}`;
      return withTilde;
  }
}

/** Basename of a path. */
export function formatBasename(path: string): string {
  return basename(path);
}

/** Humanize a remaining duration in ms (e.g. "2h - 5m"). */
export function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "0m";
  const dayMs = TIME_INTERVALS.HOUR_MS * 24;
  const days = Math.floor(ms / dayMs);
  const hours = Math.floor((ms % dayMs) / TIME_INTERVALS.HOUR_MS);
  const minutes = Math.floor((ms % TIME_INTERVALS.HOUR_MS) / TIME_INTERVALS.MINUTE_MS);
  if (days > 0 && hours > 0) return `${days}d - ${hours}h`;
  if (days > 0) return `${days}d`;
  if (hours > 0 && minutes > 0) return `${hours}h - ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

/** Format a token count as "12K" (or "12.3K" with decimals). */
export function formatTokens(tokens: number, showDecimals = false): string {
  const k = tokens / 1000;
  return showDecimals ? `${k.toFixed(1)}K` : `${Math.round(k)}K`;
}

/** Format a cost as "$1.23". */
export function formatCost(cost: number, decimals = 2): string {
  return `$${cost.toFixed(decimals)}`;
}
