/**
 * The single activation check for the whole PRD module. Everything
 * downstream short-circuits on `false` here — this is the only place the
 * module's "totally inert when off" contract lives. The other file in this
 * module that touches disk (besides `prd-io.ts`).
 */
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { harnessHomeSegment } from "../apex-target";
import { prdRouterPath } from "./prd-paths";

/** True only when `FUSE_PRD` is the exact string `"1"` — no truthy-string leniency. */
export function isPrdFlagSet(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FUSE_PRD === "1";
}

/** `CLAUDE_PROJECT_DIR` then `CURSOR_PROJECT_DIR` (first absolute value wins), else `cwd`. */
export function prdProjectRoot(cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  for (const candidate of [env.CLAUDE_PROJECT_DIR, env.CURSOR_PROJECT_DIR]) {
    if (candidate !== undefined && isAbsolute(candidate)) return candidate;
  }
  return cwd;
}

/** True when the router file exists on disk. */
export function routerExistsSync(root: string, homeSeg: string): boolean {
  return existsSync(prdRouterPath(root, homeSeg));
}

/**
 * Activation = `FUSE_PRD=1` AND the router is present. Short-circuits on the
 * env check first, so a disabled module never touches disk.
 */
export function isPrdEnabled(cwd: string, id: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isPrdFlagSet(env)) return false;
  const root = prdProjectRoot(cwd, env);
  const homeSeg = harnessHomeSegment(id);
  return routerExistsSync(root, homeSeg);
}
