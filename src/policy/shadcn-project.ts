import { existsSync } from "node:fs";
import { join } from "node:path";

/** Directories whose presence indicates shadcn/ui is installed. */
const UI_DIRS: ReadonlyArray<string> = [
  "src/components/ui",
  "components/ui",
  "src/modules/cores/shadcn/components/ui",
];

/**
 * Whether `cwd` is a shadcn/ui project, ported from the shared Python
 * `is_shadcn_project` (`shadcn_patterns.py`): true when a `components.json`
 * file exists, or any known `components/ui` directory exists under the root.
 * Used to skip `*-shadcn` sub-skill requirements when shadcn is not installed.
 * @param cwd - project root directory to scan.
 * @returns `true` when shadcn/ui is detected on disk.
 */
export function isShadcnProject(cwd: string): boolean {
  if (existsSync(join(cwd, "components.json"))) return true;
  return UI_DIRS.some((dir) => existsSync(join(cwd, dir)));
}
