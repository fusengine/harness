/**
 * Source-file scanning + project-stack detection for the ai-pilot scope.
 * Ported from the ai-pilot plugin's `cache/source-collector.ts` +
 * the stack detection in `cache/lesson-helpers.ts` (now removed).
 */
import { Glob } from "bun";
import { readdirSync } from "node:fs";

/** Source file glob patterns (monorepo-aware; separate to avoid brace-wildcards). */
const SRC_PATTERNS = [
  "src/**/*.{ts,tsx,js,jsx}",
  "app/**/*.{ts,tsx,js,jsx}",
  "apps/*/src/**/*.{ts,tsx,js,jsx}",
  "packages/*/src/**/*.{ts,tsx,js,jsx}",
] as const;

/**
 * Scan source files in `projectPath` (monorepo-aware), capped at `maxFiles`.
 * @param projectPath - Absolute project root.
 * @param maxFiles - Max files to collect (default 200).
 * @returns Absolute paths matching the source patterns.
 */
export async function scanSourceFiles(projectPath: string, maxFiles = 200): Promise<string[]> {
  const files: string[] = [];
  for (const pattern of SRC_PATTERNS) {
    try {
      for await (const p of new Glob(pattern).scan({ cwd: projectPath, absolute: true })) {
        if (p.includes("node_modules")) continue;
        files.push(p);
        if (files.length >= maxFiles) break;
      }
    } catch { /* dir may not exist */ }
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
