import { readdirSync } from "node:fs";
import { join, delimiter } from "node:path";

/** Immediate subdirectory names of `p`, or `[]` when it is missing/inaccessible. */
function subdirs(p: string): string[] {
  try {
    return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Every `skills/` parent dir across the Open-Agent-Skills layouts
 * (agentskills.io) of Claude Code, Codex and Cursor: the standalone skill roots
 * (`<base>/{.claude,.codex,.cursor,.agents}/skills` + `/etc/codex/skills`) plus
 * installed-plugin roots (`<plugin>/skills` under the Claude marketplace and the
 * Claude/Codex version caches). Shallow `readdir` only — no deep walk — so it is
 * cheap enough to run on every hook.
 */
function skillParents(home: string, cwd: string, marketplaces: string[]): string[] {
  const out: string[] = [];
  for (const base of [cwd, home]) {
    for (const tool of [".claude", ".codex", ".cursor", ".agents"]) out.push(join(base, tool, "skills"));
  }
  out.push(join("/etc", "codex", "skills"));
  // Claude marketplace: <mkt>/plugins/<plugin>/skills.
  const mktRoot = join(home, ".claude", "plugins", "marketplaces");
  for (const mkt of subdirs(mktRoot)) {
    if (!marketplaces.includes(mkt)) continue;
    const pluginsDir = join(mktRoot, mkt, "plugins");
    for (const plugin of subdirs(pluginsDir)) out.push(join(pluginsDir, plugin, "skills"));
  }
  // Version caches: <cache>/<mkt>/<plugin>/<version>/skills.
  for (const cacheRoot of [join(home, ".claude", "plugins", "cache"), join(home, ".codex", "plugins", "cache")]) {
    for (const mkt of subdirs(cacheRoot)) {
      if (!marketplaces.includes(mkt)) continue;
      for (const plugin of subdirs(join(cacheRoot, mkt))) {
        for (const ver of subdirs(join(cacheRoot, mkt, plugin))) out.push(join(cacheRoot, mkt, plugin, ver, "skills"));
      }
    }
  }
  return out;
}

/**
 * Auto-discover SOLID reference dirs (`<skill>/references` for every `solid-*`
 * skill) across the Claude/Codex/Cursor skill layouts — the fallback used when
 * `FUSE_HARNESS_REFS` is unset. Deduped by skill name (first source wins, so a
 * marketplace skill shadows its version-cache copy). Returns a path-delimiter
 * list, or `""` when none is found — with no refs the SOLID-read gate stays off.
 * @param home - User home dir (`os.homedir()`).
 * @param cwd - Current project dir (`process.cwd()`).
 * @param marketplaces - Allowlist of marketplace names to scan (env
 *   `FUSE_HARNESS_MARKETPLACES`, default `["fusengine-plugins"]`); a marketplace
 *   absent from disk simply contributes nothing. Standalone
 *   `.claude`/`.codex`/`.cursor`/`.agents` skill roots are always scanned.
 * @returns A `path.delimiter`-joined list of `references` dirs, or `""`.
 */
export function discoverRefs(home: string, cwd: string, marketplaces: string[]): string {
  const bySkill = new Map<string, string>();
  for (const parent of skillParents(home, cwd, marketplaces)) {
    for (const skill of subdirs(parent)) {
      if (!skill.startsWith("solid-") || bySkill.has(skill)) continue;
      if (subdirs(join(parent, skill)).includes("references")) bySkill.set(skill, join(parent, skill, "references"));
    }
  }
  return [...bySkill.values()].join(delimiter);
}
