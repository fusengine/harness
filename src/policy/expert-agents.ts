/**
 * Dynamic expert-agent resolution (fs). Replaces a hardcoded agent-id table:
 * scans installed marketplace plugins for an `agents/*.md` whose frontmatter
 * `name` matches the detected {@link ProjectType}, returning the real
 * `<plugin>:<agent>` id — never a fictional one absent from disk.
 *
 * Reuses the cartographer's own fs primitives ({@link findMarketplacePlugins},
 * {@link readPluginMeta}, {@link scanAgents}) — the same shallow,
 * non-recursive scan already run uncached on every SessionStart
 * (`generateEcosystemMap`), scoped here to just `agents/*.md` (skips
 * skills/commands/hooks) to keep the per-prompt cost minimal.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { findMarketplacePlugins, readPluginMeta } from "../runtime/lifecycle/cartographer/detect";
import { scanAgents } from "../runtime/lifecycle/cartographer/scan";
import type { ProjectType } from "./detect-project";

/** Sorted plugin-dir names directly under `pluginsDir` (dirs only, alpha), or `[]`. */
function pluginDirs(pluginsDir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(pluginsDir);
  } catch {
    return [];
  }
  return names
    .filter((n) => !n.startsWith(".") && !n.startsWith("_"))
    .filter((n) => {
      try {
        return statSync(join(pluginsDir, n)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Resolve the real, installed expert-agent id for `type`.
 * @param type - Detected project type.
 * @param pluginsDirOverride - Override for the marketplace plugins dir
 *   (tests); defaults to the auto-detected marketplace root.
 * @returns `<plugin>:<agent>` for the first installed plugin whose agent name
 *   starts with `type`, or "general-purpose" when none is installed.
 */
export function getExpertAgent(type: ProjectType, pluginsDirOverride?: string): string {
  const pluginsDir = pluginsDirOverride ?? findMarketplacePlugins();
  for (const dir of pluginDirs(pluginsDir)) {
    const pluginPath = join(pluginsDir, dir);
    const agent = scanAgents(pluginPath)
      .map(([, name]) => name)
      .find((name) => name.toLowerCase().startsWith(type.toLowerCase()));
    if (agent) {
      const [, pkgName] = readPluginMeta(pluginPath);
      return `${pkgName || dir}:${agent}`;
    }
  }
  return "general-purpose";
}
