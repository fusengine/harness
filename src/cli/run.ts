import { execSync } from "node:child_process";
import { evaluate } from "../policy/evaluate";
import { formatPrompt } from "../prompt/types";
import { isCodeFile } from "../util/project-root";

/** Staged files (Added/Copied/Modified/Renamed). Uses `node:child_process` (Bun shell can hang on `git show`). */
export function stagedFiles(): string[] {
  const out = execSync("git diff --cached --name-only --diff-filter=ACMR", { encoding: "utf8" });
  return out.trim().split("\n").filter(Boolean);
}

/** Read a file's staged (index) content — not the working-tree version. */
export function stagedContent(path: string): string {
  return execSync(`git show ":${path}"`, { encoding: "utf8" });
}

/**
 * Evaluate staged code files against the policy core; return violation blocks.
 * `read` is injected (the real impl is {@link stagedContent}) so this is pure + testable.
 */
export function checkStaged(files: string[], read: (path: string) => string): string[] {
  const violations: string[] = [];
  for (const file of files) {
    if (!isCodeFile(file)) continue;
    const r = evaluate({ tool: "Write", filePath: file, content: read(file) });
    if (r.decision === "deny" && r.prompt) violations.push(`${file}\n${formatPrompt(r.prompt)}`);
  }
  return violations;
}
