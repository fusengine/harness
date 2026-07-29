/**
 * Corpus/plugins root resolution (fs) and the write guard over it. Resolution
 * is PER RUNTIME (Claude marketplaces, Codex versioned plugin cache — same
 * pattern as rules-root.ts); runtimes without a plugin structure (kimi today)
 * resolve to "" and the corpus gates stay dormant. There is NO cwd fallback
 * anywhere: an agent-controlled directory can never become its own taste
 * reference (self-attested proof — the failure this gate exists to prevent).
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, normalize } from "node:path";
import type { Prompt } from "../../prompt/types";
import { detectHarness, type HarnessId } from "../../detect/harness";
import { maxSemver } from "../../util/semver";
import { CORPUS_SUFFIX, children } from "./corpus-fs";
import { probeClaudeCache } from "./corpus-resolve-cache";

/** Claude marketplace checkout: `<home>/.claude/plugins/marketplaces/<mkt>/plugins/design-expert` ("" when absent). */
function probeClaudeMarketplace(home: string): string {
  const markets = join(home, ".claude", "plugins", "marketplaces");
  for (const m of children(markets)) {
    const de = join(markets, m, "plugins", "design-expert");
    if (existsSync(de)) return de;
  }
  return "";
}

/**
 * Claude: the marketplace checkout WINS when present (a single unambiguous
 * live git checkout); the versioned plugin CACHE tree is the fallback, since
 * Claude Code keeps orphaned prior-version cache dirs ~14 days after a bump.
 */
function probeClaude(home: string): string {
  return probeClaudeMarketplace(home) || probeClaudeCache(home);
}

/** Codex: `<CODEX_HOME|~/.codex>/plugins/cache/<mkt>/design-expert/<highest STABLE semver>` ("" when absent). */
function probeCodex(env: Record<string, string | undefined>, home: string): string {
  const cache = join(env.CODEX_HOME ?? join(home, ".codex"), "plugins", "cache");
  for (const m of children(cache)) {
    const de = join(cache, m, "design-expert");
    // Only real version dirs compete — no pre-release, no stray backup/ dir.
    const latest = maxSemver(children(de).filter((v) => /^\d+\.\d+(\.\d+)?$/.test(v) && existsSync(join(de, v, "skills"))));
    if (latest) return join(de, latest);
  }
  return "";
}

/**
 * The design-expert plugin root for the ACTIVE runtime ("" = not installed).
 * `pluginsDirOverride` short-circuits resolution (tests): a PLUGINS dir whose
 * `design-expert` child is used when present, else itself.
 */
export function resolvePluginsRoot(
  pluginsDirOverride?: string,
  home: string = homedir(),
  id: HarnessId = detectHarness().id,
  env: Record<string, string | undefined> = process.env,
): string {
  if (pluginsDirOverride) {
    const de = join(pluginsDirOverride, "design-expert");
    return existsSync(de) ? de : pluginsDirOverride;
  }
  if (id === "claude-code") return probeClaude(home);
  if (id === "codex") return probeCodex(env, home);
  return "";
}

/** Resolve the delivered refs-design/ root, or "" when absent/unusable (the fail-open signal). */
export function resolveCorpusRoot(
  pluginsDirOverride?: string,
  home: string = homedir(),
  id: HarnessId = detectHarness().id,
  env: Record<string, string | undefined> = process.env,
): string {
  const root = resolvePluginsRoot(pluginsDirOverride, home, id, env);
  if (!root) return "";
  const corpus = join(root, CORPUS_SUFFIX);
  return existsSync(corpus) ? corpus : "";
}

/**
 * Deny Write/Edit/apply_patch-file under the resolved plugins root: the corpus
 * is the artefact the pipeline checks reads against, so it must stay
 * agent-proof — including while refs-design/ is still absent. Relative paths
 * (the normal form of Codex patches) are resolved against `cwd` first. SCOPE:
 * no Bash, no symlinks, no sibling marketplace — the gate protects against
 * oversight, not an adversary (the mandatory screenshot stays the unforgeable
 * proof; forging the corpus only lowers a quota).
 */
export function pluginsWriteGuard(filePath: string, pluginsRoot: string, cwd = ""): Prompt | null {
  const abs = isAbsolute(filePath) ? filePath : cwd ? normalize(join(cwd, filePath)) : filePath;
  if (!pluginsRoot || !abs.startsWith(`${pluginsRoot}/`)) return null;
  return {
    kind: "block", title: "Design pipeline",
    reason: "BLOCKED: the design-expert plugin dir (refs-design corpus) is read-only — it is the taste reference your reads are checked against. Never create or modify files there.",
    actions: ["Read the corpus with the Read tool; write your own files in the project"],
  };
}
