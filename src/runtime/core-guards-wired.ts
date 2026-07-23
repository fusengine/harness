/**
 * Detect whether the core-guards plugin is installed AND ACTIVE for a harness.
 * When it is, its `core` scope already owns the PreToolUse file-size deny
 * (`policy/evaluate.ts`), so the `solid` scope MUST abstain on the same
 * tool-call — otherwise a user with BOTH plugins wired on PreToolUse
 * Write|Edit receives the identical deny twice. Activation probing is
 * per-harness (`core-guards-active.ts`, owner decision):
 * - claude-code: marketplace copy present + `settings.json` `enabledPlugins`
 *   (required core: no entry = active; explicit `false` = disabled);
 * - codex: `[plugins."core-guards@…"] enabled = true` in `~/.codex/config.toml`;
 * - kimi: `<KIMI_CODE_HOME>/plugins/installed.json` entry not disabled.
 * SAFE DEFAULT: anything undetectable (unreadable/missing state) reads as
 * NOT active — the solid scope then fires its own deny, so the worst case is
 * a duplicate deny, NEVER zero deny.
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { claudeCoreGuardsActive, codexCoreGuardsActive, kimiCoreGuardsActive } from "./core-guards-active";

/** Immediate child dir names of `dir`, or [] when unreadable. */
function children(dir: string): string[] {
  try { return readdirSync(dir); } catch { return []; }
}

/** Claude: marketplace copy `~/.claude/plugins/marketplaces/<m>/plugins/core-guards`. */
function claudeInstalled(home: string): boolean {
  const markets = join(home, ".claude", "plugins", "marketplaces");
  return children(markets).some((m) => existsSync(join(markets, m, "plugins", "core-guards")));
}

/**
 * True when core-guards is installed AND active for the harness.
 * @param id - Harness id.
 * @param env - Environment (defaults to `process.env`).
 * @param home - OS home (defaults to `env.HOME` / `os.homedir()`; injectable).
 */
export function coreGuardsWired(
  id: string,
  env: Record<string, string | undefined> = process.env,
  home: string = env.HOME ?? homedir(),
): boolean {
  if (id === "claude-code") return claudeCoreGuardsActive(home, claudeInstalled(home));
  if (id === "codex") return codexCoreGuardsActive(home);
  if (id === "kimi") return kimiCoreGuardsActive(env.KIMI_CODE_HOME ?? join(home, ".kimi-code"));
  return false;
}
