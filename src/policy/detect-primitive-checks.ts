/**
 * Detection checks for Radix UI vs Base UI primitives, ported verbatim from
 * `detect_primitive_checks.py` (the shadcn-expert plugin's standalone
 * detection script — not wired into any hook; called on demand by the agent
 * to decide which shadcn-detection reference to read).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/** Package manager inferred from the project's lockfile. */
export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

/** `grep -rq <pattern> <path>`; true on a match, false on no-match/timeout/error. */
function grepQuiet(pattern: string, path: string): boolean {
  try {
    execFileSync("grep", ["-rq", pattern, path], { timeout: 10_000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Check `package.json` for UI library deps (weight: 40). Returns `[radix, baseui]`. */
export function checkPkgJson(root: string, signals: string[]): [number, number] {
  const pkg = join(root, "package.json");
  if (!existsSync(pkg)) return [0, 0];
  let radix = 0;
  let baseui = 0;
  try {
    const content = readFileSync(pkg, "utf8");
    if (content.includes('"@radix-ui/react-')) { radix = 40; signals.push("pkg:radix-ui"); }
    if (content.includes('"@base-ui/react')) { baseui = 40; signals.push("pkg:base-ui"); }
  } catch {
    return [0, 0];
  }
  return [radix, baseui];
}

/** Check `components.json` style (weight: 20). Returns `[radix, baseui]`. */
export function checkComponentsJson(root: string, signals: string[]): [number, number] {
  const cjson = join(root, "components.json");
  if (!existsSync(cjson)) return [0, 0];
  try {
    const data = JSON.parse(readFileSync(cjson, "utf8")) as { style?: string };
    const style = data.style ?? "";
    if (style === "new-york" || style === "default") {
      signals.push(`style:${style}`);
      return [20, 0];
    }
    if (style === "base-vega") {
      signals.push("style:base-vega");
      return [0, 20];
    }
  } catch {
    return [0, 0];
  }
  return [0, 0];
}

/** Dirs scanned for import/data-attribute signals. */
const SCAN_DIRS: ReadonlyArray<string> = ["src", "components", "app"];

function existingScanDirs(root: string): string[] {
  return SCAN_DIRS.map((d) => join(root, d)).filter((d) => {
    try { return statSync(d).isDirectory(); } catch { return false; }
  });
}

/** Scan imports (weight: 25) and data attributes (weight: 15). Returns `[radix, baseui]`. */
export function scanImportsAndAttrs(root: string, signals: string[]): [number, number] {
  const dirs = existingScanDirs(root);
  let radix = 0;
  let baseui = 0;
  if (dirs.some((d) => grepQuiet("@radix-ui/react-", d))) { radix += 25; signals.push("import:radix"); }
  if (dirs.some((d) => grepQuiet("@base-ui/react", d))) { baseui += 25; signals.push("import:base-ui"); }
  if (dirs.some((d) => grepQuiet("data-state=", d))) { radix += 15; signals.push("attr:data-state"); }
  if (dirs.some((d) => grepQuiet("data-\\[open\\]", d))) { baseui += 15; signals.push("attr:data-[open]"); }
  return [radix, baseui];
}

/** Lockfile → package manager + runner, checked in priority order. */
const LOCKFILES: ReadonlyArray<readonly [string, PackageManager, string]> = [
  ["bun.lockb", "bun", "bunx"],
  ["bun.lock", "bun", "bunx"],
  ["pnpm-lock.yaml", "pnpm", "pnpm dlx"],
  ["yarn.lock", "yarn", "yarn dlx"],
];

/** Detect the package manager from lockfiles present at `root` (defaults to npm/npx). */
export function detectPm(root: string, signals: string[]): [PackageManager, string] {
  for (const [lockfile, pm, runner] of LOCKFILES) {
    if (existsSync(join(root, lockfile))) {
      signals.push(`pm:${pm}`);
      return [pm, runner];
    }
  }
  signals.push("pm:npm");
  return ["npm", "npx"];
}
