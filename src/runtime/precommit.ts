import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Prompt } from "../prompt/types";

const TIMEOUT_MS = 30_000;
const ESLINT_CONFIGS: readonly string[] = [".eslintrc.json", ".eslintrc.js", "eslint.config.js", "eslint.config.mjs", "eslint.config.ts"];
const PRETTIER_CONFIGS: readonly string[] = [".prettierrc", ".prettierrc.json", "prettier.config.js"];

/** Run a linter; returns its error output, or "" if it passed / spawn-failed / timed out (fail-open). */
function runLinter(file: string, args: string[], label: string, cwd: string): string {
  try {
    execFileSync(file, args, { cwd, timeout: TIMEOUT_MS, stdio: ["ignore", "pipe", "pipe"] });
    return "";
  } catch (e: unknown) {
    const err = e as { status?: number | null; stdout?: Buffer; stderr?: Buffer };
    if (err.status === undefined || err.status === null) return "";
    const out = (err.stdout?.toString() ?? err.stderr?.toString() ?? "").trim();
    return out ? `[${label}]\n${out}` : "";
  }
}

/** Run the applicable linters in `cwd`, returning a block of errors per failing tool. */
function collectErrors(cwd: string): string[] {
  const has = (f: string): boolean => existsSync(join(cwd, f));
  const errors: string[] = [];
  if (has("package.json")) {
    if (ESLINT_CONFIGS.some(has)) {
      const m = runLinter("bunx", ["eslint", ".", "--max-warnings", "0"], "ESLint", cwd);
      if (m) errors.push(m);
    }
    if (has("tsconfig.json")) {
      const m = runLinter("bunx", ["tsc", "--noEmit"], "TypeScript", cwd);
      if (m) errors.push(m);
    }
    if (PRETTIER_CONFIGS.some(has)) {
      const m = runLinter("bunx", ["prettier", "--check", "."], "Prettier", cwd);
      if (m) errors.push(m);
    }
  }
  if (has("requirements.txt") || has("pyproject.toml")) {
    const m = runLinter("ruff", ["check", "."], "Ruff", cwd);
    if (m) errors.push(m);
  }
  return errors;
}

/** Block a `git commit` when linters fail (effectful: runs eslint/tsc/prettier/ruff, never auto-fixes). */
export function preCommitGate(tool: string, command: string | undefined, cwd: string | undefined): Prompt | null {
  if (tool !== "Bash" || !command || !cwd) return null;
  if (!command.startsWith("git") || !command.includes("commit")) return null;
  const errors = collectErrors(cwd);
  if (!errors.length) return null;
  return {
    kind: "block",
    title: "Pre-commit checks failed",
    reason: `COMMIT BLOCKED — fix then retry:\n\n${errors.join("\n\n")}`,
    actions: ["Fix the linter/type errors above", "Re-run the commit"],
  };
}
