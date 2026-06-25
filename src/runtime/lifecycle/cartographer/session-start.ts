/**
 * Cartographer SessionStart handler. Ports the project-map half of
 * `generate_project_map.py`: regenerates `.cartographer/project` and emits no
 * additionalContext (the plugin ecosystem map from `generate_map.py` is not
 * ported and stays as Python).
 */
import { generateProjectMap } from "./project-map";

/**
 * Regenerate the project map for `cwd` on SessionStart. Returns "" (side-effect
 * only — no additionalContext).
 * @param cwd - The working directory.
 * @returns "" always.
 */
export function cartoSessionStart(cwd: string): string {
  generateProjectMap(cwd);
  return "";
}
