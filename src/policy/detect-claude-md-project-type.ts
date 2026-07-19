import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ProjectType } from "./detect-project";

/**
 * Detect the project type from the cwd, reproducing the legacy Python logic:
 * package.json containing "next" → nextjs, else "react" → react; else
 * composer.json+artisan → laravel; else Package.swift / *.xcodeproj → swift;
 * else generic.
 * @param cwd - Project root to scan.
 * @returns The detected project type label.
 */
export function detectClaudeMdProjectType(cwd: string): ProjectType {
  const pkg = join(cwd, "package.json");
  if (existsSync(pkg)) {
    try {
      const content = readFileSync(pkg, "utf-8");
      if (content.includes("next")) return "nextjs";
      if (content.includes("react")) return "react";
    } catch {
      /* unreadable package.json → fall through */
    }
  }
  if (existsSync(join(cwd, "composer.json")) && existsSync(join(cwd, "artisan"))) return "laravel";
  if (existsSync(join(cwd, "Package.swift"))) return "swift";
  try {
    if (readdirSync(cwd).some((f) => f.endsWith(".xcodeproj"))) return "swift";
  } catch {
    /* unreadable dir → ignore */
  }
  return "generic";
}
