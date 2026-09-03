/**
 * @module prd-canon
 * Best-effort symlink canonicalization for the paths `prdPreGate`/
 * `prdPostCheck` feed into lot A's pure `isPrdScopedPath`/`classifyPrdPath`
 * (documented "string/path compare only — no fs", by design). Those
 * comparisons need `root` and each candidate file path on the SAME
 * representation — but on macOS, `process.cwd()` inside a spawned process
 * resolves `/var` to its canonical `/private/var` while a caller-constructed
 * absolute path (e.g. from `os.tmpdir()`) may still carry the unresolved
 * `/var` alias, so two paths naming the identical file compare unequal.
 * Same `realpathSync.native` + raw-path-on-failure idiom already used by
 * `adapters/cursor/context.ts`'s `cursorAbsolutePath`.
 */
import { realpathSync } from "node:fs";
import { isAbsolute, join, sep } from "node:path";

/** Canonicalizes an existing directory (e.g. the project root); the raw value on failure. */
export function canonicalRoot(root: string): string {
  try {
    return realpathSync.native(root);
  } catch {
    return root;
  }
}

/**
 * Canonicalizes an absolute file path that may not exist yet — including
 * under a brand-new subdirectory (e.g. a task's FIRST `prd/docs/<task>.md`,
 * whose `docs/` dir doesn't exist yet either): walks up from the full path,
 * dropping one segment at a time, until an ancestor resolves, then rejoins
 * the non-existent tail onto that canonical prefix. `root` itself always
 * resolves (guaranteed present by `isPrdEnabled`), so this always terminates
 * on a real answer for any path actually under the project root. A relative
 * path is returned as-is (no `root` to anchor a symlink comparison against).
 */
export function canonicalFilePath(path: string): string {
  if (!isAbsolute(path)) return path;
  const parts = path.split(sep);
  for (let end = parts.length; end > 0; end--) {
    const prefix = parts.slice(0, end).join(sep) || sep;
    try {
      const real = realpathSync.native(prefix);
      const tail = parts.slice(end);
      return tail.length > 0 ? join(real, ...tail) : real;
    } catch {
      continue; // try a shorter, more likely to exist, ancestor
    }
  }
  return path;
}
