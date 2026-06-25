/**
 * Project map generation. Ports `generate_project_map.py` (project map only).
 */
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { EXCLUDE_DIRS, PROJECT_INDICATORS } from "../../../policy/cartographer/indicators";
import { writeTree } from "./write-tree";

/** True when `dir` is a real directory. */
function isDirectory(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * True when `dir` looks like a project root (has an indicator file) and is not
 * the home directory or filesystem root.
 * @param dir - Directory to test.
 * @returns Whether `dir` is a project root.
 */
export function isProject(dir: string): boolean {
  const resolved = resolve(dir);
  const home = resolve(homedir());
  if (resolved === home || resolved === "/") return false;
  for (const f of PROJECT_INDICATORS) {
    if (existsSync(join(dir, f))) return true;
  }
  return false;
}

/**
 * Generate the `.cartographer/project` index tree for `cwd` when it is a real
 * project directory. Always returns "" (no additionalContext emitted).
 * @param cwd - The working directory.
 * @param outputDir - Override for the output tree root.
 * @returns "" (side-effect only).
 */
export function generateProjectMap(cwd: string, outputDir?: string): string {
  const projectDir = resolve(cwd);
  const out = outputDir ?? join(projectDir, ".cartographer", "project");
  if (!isDirectory(projectDir)) return "";
  if (!isProject(projectDir)) return "";
  writeTree(projectDir, out, "", EXCLUDE_DIRS);
  return "";
}
