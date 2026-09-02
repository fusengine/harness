import { isAbsolute, normalize, relative } from "node:path";
import { realpathSync } from "node:fs";

/** Preserve a Cursor path value only when it is non-empty and NUL-free. */
export function cursorPath(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && !value.includes("\0") ? value : undefined;
}

/** Validate and normalize an absolute path supplied by Cursor. */
export function cursorAbsolutePath(value: unknown): string | undefined {
  const candidate = cursorPath(value);
  if (!candidate || !isAbsolute(candidate)) return undefined;
  const path = normalize(candidate);
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

/** Preserve distinct, validated Cursor workspace roots in wire order. */
export function cursorWorkspaceRoots(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const roots = value.map(cursorAbsolutePath).filter((root): root is string => root !== undefined);
  return [...new Set(roots)];
}

function contains(root: string, filePath: string): boolean {
  const rel = relative(root, filePath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Select Cursor's project scope without replacing a valid payload cwd. Order:
 * payload `cwd` -> longest workspace root containing `filePath` ->
 * `workspaceRoots[0]` -> `CURSOR_PROJECT_DIR` env -> `CLAUDE_PROJECT_DIR` env
 * -> `fallback`. Both env vars are validated the same way as any other Cursor
 * path (`cursorAbsolutePath`: absolute, NUL-free, realpath-resolved), so an
 * unset or malformed value is silently skipped rather than trusted.
 * @param cwd - Cursor payload `cwd`, when present.
 * @param workspaceRoots - Validated, deduped Cursor `workspace_roots`.
 * @param filePath - The file the current event targets, when present.
 * @param fallback - Caller-supplied last resort (never `process.cwd()`).
 * @param env - Environment (defaults to `process.env`).
 * @returns The resolved project root.
 */
export function cursorProjectCwd(
  cwd: string | undefined,
  workspaceRoots: readonly string[],
  filePath: string | undefined,
  fallback: string,
  env: Record<string, string | undefined> = process.env,
): string {
  if (cwd) return cwd;
  if (filePath) {
    const matches = workspaceRoots.filter((root) => contains(root, filePath));
    if (matches.length > 0) return matches.sort((a, b) => b.length - a.length)[0]!;
  }
  if (workspaceRoots[0]) return workspaceRoots[0];
  const fromCursorEnv = cursorAbsolutePath(env.CURSOR_PROJECT_DIR);
  if (fromCursorEnv) return fromCursorEnv;
  const fromClaudeEnv = cursorAbsolutePath(env.CLAUDE_PROJECT_DIR);
  if (fromClaudeEnv) return fromClaudeEnv;
  return fallback;
}
