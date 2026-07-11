import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { atomicWrite } from "../../../util/json-io";
import { pathExists } from "../../../util/runtime-io";
import { buildPluginRoots } from "./plugin-roots";

/** Where the last-applied plugin-cache fingerprint is persisted. */
function manifestPath(codexHome: string): string {
  return join(codexHome, "fusengine", "state", "agents-cache-fingerprint.json");
}

/** sha256 over sorted "plugin=root" pairs — stable while cache resolution is unchanged. */
export function fingerprint(roots: Map<string, string>): string {
  const sorted = [...roots.entries()].sort(([a], [b]) => a.localeCompare(b));
  const hash = createHash("sha256");
  for (const [plugin, root] of sorted) hash.update(`${plugin}=${root}\n`);
  return hash.digest("hex");
}

/** The last-persisted fingerprint, or `undefined` (missing/corrupt — treated as "never resynced"). */
export function readFingerprint(codexHome: string): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(manifestPath(codexHome), "utf8")) as { fingerprint?: string };
    return raw.fingerprint;
  } catch {
    return undefined;
  }
}

/** Persist the applied fingerprint atomically (tmp+rename via {@link atomicWrite}). */
export function writeFingerprint(codexHome: string, value: string): void {
  atomicWrite(manifestPath(codexHome), JSON.stringify({ fingerprint: value }));
}

/** True when a direct symlink child of `dir` points at a now-missing target. */
export function hasDanglingSymlink(dir: string): boolean {
  if (!existsSync(dir)) return false;
  try {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (lstatSync(full).isSymbolicLink() && !existsSync(full)) return true;
    }
  } catch { /* best-effort */ }
  return false;
}

/**
 * Resolve the current plugin roots + fingerprint. `undefined` = nothing cached
 * (fail-open — the initial installer, not this hook, owns that case).
 * @param pluginsRoot - The plugin cache root.
 */
export function resolveCurrentFingerprint(pluginsRoot: string): { roots: Map<string, string>; value: string } | undefined {
  if (!pathExists(pluginsRoot)) return undefined;
  const roots = buildPluginRoots(pluginsRoot);
  if (roots.size === 0) return undefined;
  return { roots, value: fingerprint(roots) };
}

/** True when a resync is due: fingerprint changed/never recorded, or a command symlink is dangling. */
export function needsResync(codexHome: string, currentValue: string, promptsDir: string): boolean {
  return currentValue !== readFingerprint(codexHome) || hasDanglingSymlink(promptsDir);
}
