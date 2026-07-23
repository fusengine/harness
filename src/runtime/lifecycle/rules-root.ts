/**
 * Dynamic rules-plugin root resolution. The historical `CLAUDE_PLUGIN_ROOT ??
 * cwd` chain only worked when the harness exported the plugin root — Kimi
 * injects `KIMI_PLUGIN_ROOT` instead, and a bare cwd fallback never held a
 * `rules/` dir. Resolution order (first hit wins):
 * 1. `CLAUDE_PLUGIN_ROOT` (claude-code/codex plugin-declared hooks);
 * 2. `KIMI_PLUGIN_ROOT` (kimi plugin-declared hooks);
 * 3. Per-harness install probe (claude marketplace, codex versioned cache,
 *    kimi managed plugins) — first `<plugin>/rules` dir whose plugin folder
 *    name contains "rules";
 * 4. `cwd` (historical fallback, unchanged behavior).
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { maxSemver } from "../../util/semver";

/** Immediate child dir names of `dir`, or [] when unreadable. */
function children(dir: string): string[] {
  try { return readdirSync(dir); } catch { return []; }
}

/** First existing `<base>/<child>/rules` where `child` names a rules plugin. */
function probe(base: string, childFilter: (name: string) => boolean): string | null {
  for (const child of children(base).sort()) {
    if (!childFilter(child)) continue;
    const dir = join(base, child, "rules");
    if (existsSync(dir)) return join(base, child);
  }
  return null;
}

/** Claude: `~/.claude/plugins/marketplaces/<marketplace>/plugins/<rules-plugin>/`. */
function probeClaude(home: string): string | null {
  const markets = join(home, ".claude", "plugins", "marketplaces");
  for (const m of children(markets).sort()) {
    const hit = probe(join(markets, m, "plugins"), (n) => n.includes("rules"));
    if (hit) return hit;
  }
  return null;
}

/** Codex: `~/.codex/plugins/cache/<marketplace>/<rules-plugin>/<version>/` (highest semver). */
function probeCodex(home: string): string | null {
  const cache = join(home, ".codex", "plugins", "cache");
  for (const m of children(cache).sort()) {
    for (const p of children(join(cache, m)).sort()) {
      if (!p.includes("rules")) continue;
      const versions = children(join(cache, m, p)).filter((v) => existsSync(join(cache, m, p, v, "rules")));
      const latest = maxSemver(versions);
      if (latest) return join(cache, m, p, latest);
    }
  }
  return null;
}

/** Kimi: `<KIMI_CODE_HOME>/plugins/managed/<rules-plugin>/` (managed install copy). */
function probeKimi(env: Record<string, string | undefined>, home: string): string | null {
  const root = env.KIMI_CODE_HOME ?? join(home, ".kimi-code");
  return probe(join(root, "plugins", "managed"), (n) => n.includes("rules"));
}

/**
 * Resolve the directory whose `rules/` subtree holds the `*.md` rule files.
 * @param id - Harness id (selects the install-layout probe).
 * @param cwd - Historical fallback root.
 * @param env - Environment (defaults to `process.env`).
 * @returns The plugin root to read `rules/` from.
 */
export function resolveRulesRoot(
  id: string,
  cwd: string,
  env: Record<string, string | undefined> = process.env,
): string {
  if (env.CLAUDE_PLUGIN_ROOT) return env.CLAUDE_PLUGIN_ROOT;
  if (env.KIMI_PLUGIN_ROOT) return env.KIMI_PLUGIN_ROOT;
  const home = env.HOME ?? homedir();
  const hit = id === "codex" ? probeCodex(home)
    : id === "kimi" ? probeKimi(env, home)
    : id === "claude-code" ? probeClaude(home)
    : null;
  return hit ?? cwd;
}
