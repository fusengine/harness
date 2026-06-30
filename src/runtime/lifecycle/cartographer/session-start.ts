/**
 * Cartographer SessionStart handler. Ports BOTH halves of the Python maps:
 * `generate_project_map.py` (regenerate `.cartographer/project`) and
 * `generate_map.py` (regenerate the plugin ecosystem map), emitting the
 * navigation context from the latter as additionalContext.
 */
import { resolve } from "node:path";
import { generateProjectMap } from "./project-map";
import { generateEcosystemMap } from "./ecosystem-map";
import { contextResponse } from "../../../adapters/claude";

/**
 * Resolve the marketplace plugins dir from `CLAUDE_PLUGIN_ROOT`, mirroring the
 * Python hook which passes `${CLAUDE_PLUGIN_ROOT}/..` to `generate_map.py`.
 * @returns The plugins dir (env `/..`), or `undefined` to fall back to auto-detect.
 */
function pluginsDirFromEnv(): string | undefined {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  return root ? resolve(root, "..") : undefined;
}

/**
 * Regenerate the project map + plugin ecosystem map for `cwd` on SessionStart.
 * Emits the ecosystem navigation context as additionalContext (or "").
 * @param cwd - The working directory.
 * @param now - Clock for the ecosystem map banner timestamp.
 * @returns The SessionStart additionalContext response, or "".
 */
export function cartoSessionStart(cwd: string, now: number = Date.now()): string {
  generateProjectMap(cwd);
  const ctx = generateEcosystemMap(now, pluginsDirFromEnv());
  return ctx ? contextResponse("SessionStart", ctx) : "";
}
