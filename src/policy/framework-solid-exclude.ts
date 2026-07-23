/** Build/dep paths excluded from React/Next.js SOLID gating — segment-anchored (parity `r"/(node_modules|dist|build|\.next)/"`), NOT a bare substring, so `distance.ts`/`rebuild/` stay gated. */
const JS_EXCLUDE_RE: RegExp = /(^|\/)(node_modules|dist|build|\.next)(\/|$)/;
/** Vendored dependency paths excluded from Laravel/PHP SOLID gating. */
const PHP_EXCLUDE_RE: RegExp = /\/vendor\//;
/** Derived/build artifact paths excluded from Swift SOLID gating. */
const SWIFT_EXCLUDE_RE: RegExp = /(\.build|DerivedData|Pods)/;

/**
 * Whether a JS/TS (React/Next.js) file path is an excluded build artifact.
 * Matches the Python validators' early-return guard to avoid false positives.
 * @param filePath - absolute path of the file under validation
 */
export function isExcludedJsPath(filePath: string): boolean {
  return JS_EXCLUDE_RE.test(filePath);
}

/**
 * Whether a PHP (Laravel) file path is a vendored dependency to skip.
 * @param filePath - absolute path of the file under validation
 */
export function isExcludedPhpPath(filePath: string): boolean {
  return PHP_EXCLUDE_RE.test(filePath);
}

/**
 * Whether a Swift file path is a derived/build artifact to skip.
 * @param filePath - absolute path of the file under validation
 */
export function isExcludedSwiftPath(filePath: string): boolean {
  return SWIFT_EXCLUDE_RE.test(filePath);
}

/**
 * This harness's own gate-detection source files. They hold the React/Next
 * detection literals as regex source text (client-directive string, hook/
 * event names, store/query/route signals) — scanning them as JS/TS would
 * self-match the very heuristics they define. Exempt by exact filename or by
 * the conventions/ detector directory, not by broad directory, so a genuine
 * SOLID violation elsewhere in src/policy/ stays gated by the
 * framework-agnostic line-size check in policy/evaluate.ts, untouched.
 */
const SELF_GATE_EXCLUDE_RE: RegExp = /(^|\/)src\/policy\/(framework-solid-gates(-systems)?\.ts|framework-solid-extended\.ts|detect-framework\.ts|conventions\/[^/]+\.ts|guards\/interface-separation-ext\.ts)$/;

/**
 * Whether a JS/TS file path is this harness's own gate-detection source —
 * exempt from the pattern heuristics (not the line-size ceiling) to avoid
 * self-blocking on regex literals that look like the code they detect.
 * @param filePath - absolute path of the file under validation
 */
export function isSelfGateSourcePath(filePath: string): boolean {
  return SELF_GATE_EXCLUDE_RE.test(filePath);
}
