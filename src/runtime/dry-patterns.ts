/** Short identifiers never worth a duplication check (control flow, tiny names). */
export const DRY_KEYWORDS: ReadonlySet<string> = new Set([
  "if", "for", "while", "switch", "catch", "return", "async",
  "new", "get", "set", "map", "run", "use", "test", "main",
]);

/** Extensions treated as TS/JS-family for symbol extraction. */
export const TS_EXT: ReadonlySet<string> = new Set([".ts", ".tsx", ".js", ".jsx", ".astro"]);

/** Declaration patterns whose capture group 1 is the declared symbol name (TS/JS). */
export const TS_PATTERNS: readonly RegExp[] = [
  /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*[(<]/g,
  /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/g,
  /class\s+(\w+)\b/g,
];

/**
 * Declaration patterns for PHP (capture group 1 = symbol name). The modifier run
 * is bounded (`{0,6}`) on purpose: an unbounded `(?:…\s+)*` is quadratic (O(n²))
 * on a long whitespace/keyword run with no trailing `function`, which would block
 * the hook for seconds on a crafted file. A real PHP signature has at most a few
 * leading keywords, so the bound is behavior-equivalent and keeps matching linear.
 */
export const PHP_PATTERNS: readonly RegExp[] = [
  /(?:(?:public|protected|private|static|final|abstract|readonly)\s+){0,6}function\s+(\w+)\s*\(/g,
  /(?:class|interface|trait)\s+(\w+)\b/g,
];

/** Directories grep skips when scanning for existing declarations. */
export const EXCLUDE_DIRS: readonly string[] = [
  "vendor", "node_modules", ".next", ".git", "dist", "build", "coverage", ".turbo",
];
