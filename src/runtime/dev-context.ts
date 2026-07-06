import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { capFragment } from "./inject-budget";

/** Run a git subcommand in `cwd`, returning trimmed stdout or "" on error. */
function git(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: "pipe", timeout: 5000 }).trim();
  } catch {
    return "";
  }
}

/** Build the git portion of the dev context (branch + up to 5 changed files). */
export function gitContext(cwd: string): string[] {
  if (!existsSync(join(cwd, ".git"))) return [];
  const parts = [`Git branch: ${git(cwd, ["branch", "--show-current"]) || "unknown"}`];
  const status = git(cwd, ["status", "--porcelain"]);
  if (status) parts.push("Modified files:\n" + status.split("\n").slice(0, 5).join("\n"));
  return parts;
}

/** Build the project-type portion (mirrors load-dev-context.py exactly). */
export function projectContext(cwd: string): string[] {
  const parts: string[] = [];
  const has = (f: string): boolean => existsSync(join(cwd, f));
  if (["next.config.js", "next.config.ts", "next.config.mjs"].some(has)) parts.push("Project: Next.js");
  else if (has("package.json")) parts.push("Project: Node.js");
  if (has("composer.json") && has("artisan")) parts.push("Project: Laravel");
  if (has("Package.swift")) parts.push("Project: Swift");
  return parts;
}

/**
 * Build the SessionStart dev-context block (git + project type), or "" when
 * nothing applies. Ports `core-guards/scripts/session-start/load-dev-context.py`.
 * @param cwd - Project root to inspect.
 * @returns The joined additionalContext text (possibly empty).
 */
export function devContext(cwd: string): string {
  return capFragment("dev-context", [...gitContext(cwd), ...projectContext(cwd)].join("\n"));
}
