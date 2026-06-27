/**
 * Source-file scanning + project-stack detection for the ai-pilot scope.
 * Ported from the ai-pilot plugin's `cache/source-collector.ts` +
 * the stack detection in `cache/lesson-helpers.ts` (now removed).
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { collectFiles } from "../../../util/runtime-io";

/** Source extensions to collect (monorepo-aware, dot-prefixed for matching). */
const SRC_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);
/** Roots walked: `src`, `app`, plus each child `src` under `apps/` and `packages/`. */
const TOP_DIRS = ["src", "app"] as const;
const NESTED_PARENTS = ["apps", "packages"] as const;

/** Collect the existing monorepo `src` roots nested under `apps/` and `packages/`. */
function nestedRoots(projectPath: string): string[] {
  const roots: string[] = [];
  for (const parent of NESTED_PARENTS) {
    try {
      for (const e of readdirSync(join(projectPath, parent), { withFileTypes: true })) {
        if (e.isDirectory()) roots.push(join(projectPath, parent, e.name, "src"));
      }
    } catch { /* parent dir may not exist */ }
  }
  return roots;
}

/**
 * Scan source files in `projectPath` (monorepo-aware), capped at `maxFiles`.
 * Node+Bun portable: walks `node:fs` recursively (replaces the Bun `Glob`).
 * @param projectPath - Absolute project root.
 * @param maxFiles - Max files to collect (default 200).
 * @returns Absolute paths matching the source extensions.
 */
export async function scanSourceFiles(projectPath: string, maxFiles = 200): Promise<string[]> {
  const files: string[] = [];
  const roots = [...TOP_DIRS.map((d) => join(projectPath, d)), ...nestedRoots(projectPath)];
  for (const root of roots) {
    collectFiles(root, SRC_EXTS, files, maxFiles);
    if (files.length >= maxFiles) break;
  }
  return files;
}

/** Detect the project stack from config files in the project root. */
export function detectStack(projectPath: string): string {
  try {
    const entries = readdirSync(projectPath);
    if (entries.some((f) => f.startsWith("next.config"))) return "nextjs";
    if (entries.includes("composer.json")) return "laravel";
    if (entries.some((f) => f.endsWith(".xcodeproj")) || entries.includes("Package.swift")) return "swift";
    if (entries.some((f) => f.startsWith("tailwind.config"))) return "tailwindcss";
  } catch { /* fallback */ }
  return "universal";
}
