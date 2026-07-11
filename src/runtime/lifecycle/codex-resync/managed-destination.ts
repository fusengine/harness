import { lstatSync, readFileSync, readlinkSync, unlinkSync } from "node:fs";

/** Marker line stamped at the top of a materialized (non-symlinked) agent TOML. */
export const MANAGED_AGENT_MARKER = "# Managed by fusengine-codex; source:";

/** True when a symlink target lives under a plugin cache dir (ours to manage). */
function isManagedPluginTarget(target: string): boolean {
  return target.includes("/plugins/") || target.includes("\\plugins\\");
}

/**
 * Clear a previously-installed destination before reinstalling it, but ONLY
 * when it is clearly ours: a symlink into a plugin cache dir, or a text file
 * stamped with {@link MANAGED_AGENT_MARKER}. Anything else (a user's own file,
 * a foreign symlink) is left untouched. Ports the merged behavior of
 * `plugin-managed-destination.ts` + the local helper in
 * `plugin-file-symlinks.ts` (this harness always runs hook-silent, so the
 * `@clack/prompts` warnings those ports had are dropped, not translated).
 * @param path - The destination path to check/clear.
 * @returns `"missing"` (nothing there), `"removed"` (ours, cleared), or
 * `"skip"` (foreign — left alone).
 */
export function clearManagedDestination(path: string): "missing" | "removed" | "skip" {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      if (!isManagedPluginTarget(readlinkSync(path))) return "skip";
      unlinkSync(path);
      return "removed";
    }
    if (readFileSync(path, "utf8").startsWith(MANAGED_AGENT_MARKER)) {
      unlinkSync(path);
      return "removed";
    }
    return "skip";
  } catch {
    return "missing";
  }
}
