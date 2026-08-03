import type { PluginScope } from "./lifecycle";

/** Options for {@link handleHook} (caller supplies the clock + project root). */
export interface HandleOptions {
  now: number;
  cwd: string;
  /** Directory of SOLID reference `.md` files for `solidReadGate` (else inert). */
  refsDir?: string;
  /** APEX freshness window in ms (from `FUSE_ENFORCE_TTL_SEC`). */
  windowMs?: number;
  /** Which plugin's hooks.json invoked the harness (selects lifecycle behavior). */
  scope?: PluginScope;
  /**
   * Test/integration seam: the resolved refs-design corpus root ("" = absent).
   * Undefined = resolve from disk (the production behavior); supplied = used
   * as-is, so tests can drive the corpus-present branch deterministically.
   */
  corpusRoot?: string;
  /** Test-only OS home override for the session-anchored design cache dir (see design-cache-resolve.ts). Undefined = real `os.homedir()`. */
  home?: string;
}

/** What the hook bin should print + exit with. */
export interface HandleOutcome {
  stdout: string;
  exit: number;
}
