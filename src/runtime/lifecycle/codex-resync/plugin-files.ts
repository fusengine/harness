import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compareVersionsDesc } from "./plugin-roots";

/** One discovered plugin file: which plugin owns it, its filename, and its source path. */
export interface PluginFile {
  plugin: string;
  file: string;
  src: string;
}

/** Files matching `extension` directly under `dir`, tagged with `plugin`. */
function filesIn(dir: string, plugin: string, extension: string): PluginFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(extension))
    .map((file) => ({ plugin, file, src: join(dir, file) }));
}

/** Versioned plugin layout: newest version subdir wins, first match returned. */
function listVersionedFiles(pluginRoot: string, plugin: string, subdir: string, extension: string): PluginFile[] {
  let versions: string[];
  try {
    versions = readdirSync(pluginRoot, { withFileTypes: true })
      .filter((v) => v.isDirectory() && !v.name.startsWith("."))
      .map((v) => v.name)
      .sort(compareVersionsDesc);
  } catch {
    return [];
  }
  for (const version of versions) {
    const found = filesIn(join(pluginRoot, version, subdir), plugin, extension);
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * Discover every plugin's files of a given kind (agents `.toml`, commands
 * `.md`) across a plugins cache root — unversioned layout first, else the
 * newest version subdir. Ports `plugin-file-discovery.ts::listPluginFiles`.
 * @param pluginsRoot - The plugin cache root.
 * @param subdir - `"agents"` or `"commands"`.
 * @param extension - File extension to match, including the dot.
 */
export function listPluginFiles(pluginsRoot: string, subdir: string, extension: string): PluginFile[] {
  const out: PluginFile[] = [];
  let entries: string[];
  try {
    entries = readdirSync(pluginsRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "_shared")
      .map((e) => e.name);
  } catch {
    return out;
  }
  for (const plugin of entries) {
    const direct = filesIn(join(pluginsRoot, plugin, subdir), plugin, extension);
    if (direct.length > 0) {
      out.push(...direct);
      continue;
    }
    out.push(...listVersionedFiles(join(pluginsRoot, plugin), plugin, subdir, extension));
  }
  return out;
}
