import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { contextResponse } from "../../adapters/claude";

const TS_EXT = /\.(ts|tsx)$/;
const TIMEOUT_MS = 10000;

/** True when `bin` is resolvable on PATH (mirrors shutil.which). */
function hasBin(bin: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [bin], { stdio: "pipe", timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/** Run `bin args`, returning `{ code, out }` (code 1 on spawn error). */
function run(bin: string, args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync(bin, args, { encoding: "utf-8", stdio: "pipe", timeout: TIMEOUT_MS });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string | Buffer };
    return { code: e.status ?? 1, out: typeof e.stdout === "string" ? e.stdout : e.stdout?.toString() ?? "" };
  }
}

/**
 * Handle PostToolUse for TS/TSX: report eslint/prettier issues (never fixes) as
 * additionalContext. Ports `post-tool-use/post-edit-typescript.py`.
 * @param filePath - The edited file path.
 * @returns The native hook stdout (possibly empty).
 */
export function postEditTypescript(filePath: string): string {
  if (!filePath || !TS_EXT.test(filePath) || !existsSync(filePath)) return "";
  const issues: string[] = [];
  if (hasBin("eslint")) {
    const r = run("eslint", ["--no-fix", "--format", "compact", filePath]);
    if (r.code !== 0 && r.out.trim()) issues.push(`ESLint:\n${r.out.trim()}`);
  }
  if (hasBin("prettier")) {
    const r = run("prettier", ["--check", filePath]);
    if (r.code !== 0) issues.push(`Prettier: ${basename(filePath)} needs formatting`);
  }
  if (issues.length === 0) return "";
  return contextResponse("PostToolUse", `Lint issues in ${basename(filePath)}: ${issues.join(" | ")}`);
}
