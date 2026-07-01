/**
 * Dynamic skill-path resolution (fs). Replaces a hardcoded `PLUGIN_DIR`
 * table (framework -> plugin dir name), which can drift from what's actually
 * installed: scans installed marketplace plugins for a `skills/<name>/SKILL.md`
 * that exists ON DISK, returning the first real absolute path found — never a
 * guessed one.
 *
 * Deliberately lighter than the cartographer's own `scanSkills` (which
 * frontmatter-parses every skill in a plugin): this runs once per missing
 * sub-skill on every gated Write/Edit, so it does a single flat `readdirSync`
 * of the plugins dir + one `existsSync` per candidate — no file reads, no
 * recursion, no `statSync`.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { findMarketplacePlugins } from "../runtime/lifecycle/cartographer/detect";
import { PLUGINS_DIR } from "./file-size";

/** Sorted entry names of `dir` (alpha, byte-order), or `[]` on error. */
function pluginDirNames(dir: string): string[] {
  try {
    return readdirSync(dir).sort((a, b) => a.localeCompare(b, "en"));
  } catch {
    return [];
  }
}

/**
 * Resolve the real, installed `SKILL.md` path for `skillName`.
 * @param skillName - the sub-skill directory name (e.g. "solid-react",
 *   "shadcn-detection", "react-shadcn").
 * @param pluginsDirOverride - override for the marketplace plugins dir
 *   (tests); defaults to the auto-detected marketplace root.
 * @returns the absolute `<pluginDir>/skills/<skillName>/SKILL.md` of the
 *   first installed plugin that actually has it, or the generic
 *   `${PLUGINS_DIR}/<skillName>` fallback when none is found (CI/test
 *   environments without a marketplace).
 */
export function resolveSkillPath(skillName: string, pluginsDirOverride?: string): string {
  const pluginsDir = pluginsDirOverride ?? findMarketplacePlugins();
  for (const dir of pluginDirNames(pluginsDir)) {
    const candidate = join(pluginsDir, dir, "skills", skillName, "SKILL.md");
    if (existsSync(candidate)) return candidate;
  }
  return `${PLUGINS_DIR}/${skillName}`;
}
