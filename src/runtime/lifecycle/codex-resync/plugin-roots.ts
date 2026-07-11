import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Frozen marketplace name (matches codex-plugins' own `scripts/install-codex.ts`). */
export const MARKETPLACE = "fusengine-codex";

/** The plugin cache root under a Codex home. */
export function pluginsCacheRoot(codexHome: string): string {
  return join(codexHome, "plugins", "cache", MARKETPLACE);
}

/** Descending semver-ish compare (`"2.1" > "10.0"` stays false — numeric per segment). */
export function compareVersionsDesc(a: string, b: string): number {
  const left = a.split(/[.-]/).map((part) => Number.parseInt(part, 10));
  const right = b.split(/[.-]/).map((part) => Number.parseInt(part, 10));
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    const av = Number.isNaN(left[i]) ? 0 : (left[i] ?? 0);
    const bv = Number.isNaN(right[i]) ? 0 : (right[i] ?? 0);
    if (av !== bv) return bv - av;
  }
  return b.localeCompare(a);
}

/** Resolve one plugin's active root: unversioned dir first, else the newest version dir. */
function resolvePluginRoot(pluginsRoot: string, plugin: string): string | undefined {
  const root = join(pluginsRoot, plugin);
  if (existsSync(join(root, ".codex-plugin")) || existsSync(join(root, "skills"))) return root;
  let entries: string[];
  try {
    entries = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return undefined;
  }
  const versions = entries.sort(compareVersionsDesc);
  return versions[0] ? join(root, versions[0]) : undefined;
}

/**
 * Resolve the active root directory of every installed plugin under a plugins
 * cache root, keyed by plugin name. Ports `plugin-root-resolver.ts::buildPluginRoots`.
 * @param pluginsRoot - The plugin cache root (see {@link pluginsCacheRoot}).
 * @returns Plugin name -> resolved root dir (missing entries are silently skipped).
 */
export function buildPluginRoots(pluginsRoot: string): Map<string, string> {
  const roots = new Map<string, string>();
  let entries: string[];
  try {
    entries = readdirSync(pluginsRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "_shared")
      .map((e) => e.name);
  } catch {
    return roots;
  }
  for (const plugin of entries) {
    const root = resolvePluginRoot(pluginsRoot, plugin);
    if (root) roots.set(plugin, root);
  }
  return roots;
}
