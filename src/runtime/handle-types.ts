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
}

/** What the hook bin should print + exit with. */
export interface HandleOutcome {
  stdout: string;
  exit: number;
}
