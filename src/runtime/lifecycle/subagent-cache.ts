import { join } from "node:path";
import { homedir } from "node:os";
import { loadIndex } from "../../cache/io";
import { contextResponse } from "../../adapters/claude";
import { sanitizeSessionId, sessionsDir } from "../home-state";

const DEFAULT_TTL_MIN = 30;

/** Resolve cache TTL (minutes) from `FUSENGINE_CACHE_TTL_MIN` or default. */
function ttlMinutes(env: Record<string, string | undefined>): number {
  const raw = (env.FUSENGINE_CACHE_TTL_MIN ?? "").trim();
  const val = Number.parseInt(raw, 10);
  return Number.isFinite(val) && val > 0 ? val : DEFAULT_TTL_MIN;
}

/** True when ISO ts `YYYY-MM-DDTHH:MM:SSZ` is within `ttlMin` minutes of now. */
function isFresh(ts: string, ttlMin: number, now: number): boolean {
  const parsed = Date.parse(ts);
  if (Number.isNaN(parsed)) return false;
  const ageSec = (now - parsed) / 1000;
  return ageSec >= 0 && ageSec <= ttlMin * 60;
}

/** Sanitize + truncate a cell value (replace `|`/newline, ellipsize). */
function trunc(text: unknown, limit: number): string {
  const t = String(text ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
  return t.length <= limit ? t : t.slice(0, limit - 3) + "...";
}

/** Render fresh cache entries as the markdown injection block. */
function render(entries: Record<string, unknown>[]): string {
  const lines = [
    "# MCP Cache disponible cette session",
    "Avant de lancer mcp__context7/exa, verifie si deja cached.",
    "Lis le fichier .md via Read pour recuperer le resultat.",
    "APEX: Read sur cache MCP compte comme research-expert satisfait.",
    "",
    "| Tool | Query | File |",
    "| --- | --- | --- |",
  ];
  for (const e of entries) lines.push(`| ${trunc(e.tool, 40)} | ${trunc(e.query, 60)} | ${trunc(e.file, 50)} |`);
  return lines.join("\n");
}

/**
 * Handle SubagentStart: surface fresh MCP cache entries for the session as
 * `additionalContext`. Ports `subagent-start/inject-context-cache.py`.
 * @param sessionIdRaw - Raw session id from the payload.
 * @param home - Home dir (defaults to `~`).
 * @param env - Environment (defaults to `process.env`).
 * @param now - Clock (defaults to `Date.now()`).
 * @returns The native hook stdout (possibly empty).
 */
export function subagentCacheContext(sessionIdRaw: unknown, home: string = homedir(), env: Record<string, string | undefined> = process.env, now: number = Date.now()): string {
  const sid = sanitizeSessionId(sessionIdRaw === "" || sessionIdRaw == null ? "unknown" : sessionIdRaw);
  if (!sid) return "";
  const index = loadIndex(join(sessionsDir(home), sid, "context", "index.json")) as Record<string, unknown>[];
  if (index.length === 0) return "";
  const fresh = index.filter((e) => isFresh(String(e.ts ?? ""), ttlMinutes(env), now));
  return fresh.length ? contextResponse("SubagentStart", render(fresh)) : "";
}
