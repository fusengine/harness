/**
 * Cursor plugin-root resolution — independent from the rules-plugin probing
 * in `../../runtime/lifecycle/rules-root.ts`. Ground truth (Cursor 3.18.25
 * binary + cursor.com/docs/hooks): `CURSOR_PLUGIN_ROOT` / `CLAUDE_PLUGIN_ROOT`
 * (both equal to the plugin install dir) are injected ONLY into
 * plugin-declared hook processes — never user (`~/.cursor/hooks.json`),
 * project (`.cursor/hooks.json`), or enterprise hooks. A plugin hook's cwd is
 * the plugin install dir, EXCEPT for `stop`/`subagentStop`, where it is the
 * workspace root — callers must pass the right `cwd` for the event they are
 * handling. Precedence: (1) `CURSOR_PLUGIN_ROOT` env, (2) `CLAUDE_PLUGIN_ROOT`
 * env, (3) `cwd` when it carries a Cursor plugin marker
 * (`.cursor-plugin/plugin.json`, `plugin.json` + `hooks/hooks.json`, or a
 * bare `hooks/hooks.json` — matches installed-plugin layouts under
 * `~/.cursor/plugins/cache/**` and `~/.cursor/plugins/local/<name>/`), (4)
 * `none`. Cursor refuses symlinked config paths itself; we do not share that
 * constraint, so every resolved candidate is realpath-followed instead.
 */
import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

/** How the resolved Cursor plugin root was determined. */
export type CursorPluginRootSource =
  | "env:CURSOR_PLUGIN_ROOT"
  | "env:CLAUDE_PLUGIN_ROOT"
  | "cwd:plugin-marker"
  | "none";

/** Result of resolving the Cursor plugin install root. */
export interface CursorPluginRootResult {
  /** Realpath-resolved plugin install directory, or `null` when unproven. */
  root: string | null;
  /** Which precedence step produced `root`. */
  source: CursorPluginRootSource;
  /** One diagnostic entry per candidate that was examined and rejected. */
  checked: string[];
}

/** Validate an env candidate: non-empty, NUL-free, absolute, existing dir. */
function validateEnvCandidate(label: string, value: string | undefined, checked: string[]): string | null {
  if (value === undefined || value === "") {
    checked.push(`${label}: unset`);
    return null;
  }
  if (value.includes("\0")) {
    checked.push(`${label}: invalid (contains NUL): "${value}"`);
    return null;
  }
  if (!isAbsolute(value)) {
    checked.push(`${label}: invalid (not absolute): "${value}"`);
    return null;
  }
  try {
    if (!statSync(value).isDirectory()) {
      checked.push(`${label}: invalid (not a directory): "${value}"`);
      return null;
    }
  } catch {
    checked.push(`${label}: invalid (no such directory): "${value}"`);
    return null;
  }
  try {
    return realpathSync.native(value);
  } catch {
    checked.push(`${label}: invalid (realpath failed): "${value}"`);
    return null;
  }
}

/** True when `dir` carries a recognized Cursor plugin install marker. */
function hasPluginMarker(dir: string): boolean {
  if (existsSync(join(dir, ".cursor-plugin", "plugin.json"))) return true;
  if (existsSync(join(dir, "plugin.json")) && existsSync(join(dir, "hooks", "hooks.json"))) return true;
  return existsSync(join(dir, "hooks", "hooks.json"));
}

/**
 * Resolve the Cursor plugin install root a plugin-declared hook runs from.
 * @param env - Environment (defaults to `process.env`).
 * @param cwd - The hook process's cwd for the current event (plugin root for
 *   most events, workspace root for `stop`/`subagentStop` — caller's choice).
 * @returns The resolved root, its source, and every rejected candidate.
 */
export function resolveCursorPluginRoot(
  env: Record<string, string | undefined>,
  cwd: string,
): CursorPluginRootResult {
  const checked: string[] = [];
  const fromCursor = validateEnvCandidate("env:CURSOR_PLUGIN_ROOT", env.CURSOR_PLUGIN_ROOT, checked);
  if (fromCursor) return { root: fromCursor, source: "env:CURSOR_PLUGIN_ROOT", checked };
  const fromClaude = validateEnvCandidate("env:CLAUDE_PLUGIN_ROOT", env.CLAUDE_PLUGIN_ROOT, checked);
  if (fromClaude) return { root: fromClaude, source: "env:CLAUDE_PLUGIN_ROOT", checked };
  if (hasPluginMarker(cwd)) {
    let resolved = cwd;
    try {
      resolved = realpathSync.native(cwd);
    } catch {
      /* keep raw cwd when realpath fails (e.g. already-canonical or unreadable parent) */
    }
    return { root: resolved, source: "cwd:plugin-marker", checked };
  }
  checked.push(`cwd:"${cwd}": no plugin marker found`);
  return { root: null, source: "none", checked };
}
