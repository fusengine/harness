/**
 * Cartographer SessionStart handler. Ports BOTH halves of the Python maps:
 * `generate_project_map.py` (regenerate `.cartographer/project`) and
 * `generate_map.py` (regenerate the plugin ecosystem map), emitting the
 * navigation context from the latter as additionalContext.
 */
import { generateProjectMap } from "./project-map";
import { generateEcosystemMap } from "./ecosystem-map";
import { contextResponse } from "../../../adapters/claude";

/**
 * Regenerate the project map + plugin ecosystem map for `cwd` on SessionStart.
 * Emits the ecosystem navigation context as additionalContext (or "").
 * @param cwd - The working directory.
 * @param now - Clock for the ecosystem map banner timestamp.
 * @returns The SessionStart additionalContext response, or "".
 */
export function cartoSessionStart(cwd: string, now: number = Date.now()): string {
  generateProjectMap(cwd);
  const ctx = generateEcosystemMap(now);
  return ctx ? contextResponse("SessionStart", ctx) : "";
}
