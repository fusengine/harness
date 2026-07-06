/**
 * @module test/sim/validate
 * Field-level validators for scenario JSON (steps, expects, setup files). Pure,
 * fail-fast, every error located by the caller-provided `ctx` prefix. Split out
 * of load.ts (SRP): load.ts orchestrates file->Scenario, this file owns the rules.
 */
import type { HarnessId } from "../../src/detect/interfaces/types";
import type { Scenario, Step, StepExpect } from "./types";

/**
 * Harness ids a scenario may spawn — exactly the set `src/runtime/respond.ts`
 * renders a native response for. The `readonly HarnessId[]` annotation keeps
 * every entry a real harness id (a typo fails `tsc`, and satisfies
 * `--isolatedDeclarations`); the runtime `includes` guard in
 * {@link validateHarness} derives its allow-list from this same array (no
 * second hand-maintained list to drift).
 */
export const SUPPORTED_HARNESSES: readonly HarnessId[] = ["claude-code", "codex", "cursor", "cline", "gemini-cli", "hermes"];

/** Assert `v` is a plain object, else throw a located error. */
export function asObject(v: unknown, ctx: string): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error(`${ctx} must be an object`);
  return v as Record<string, unknown>;
}

/**
 * Validate the optional `harness` field: absent -> undefined (caller defaults to
 * `claude-code`); a string -> must be one of {@link SUPPORTED_HARNESSES}, else a
 * located throw. Fails fast at load so a typo'd id never silently spawns the
 * wrong adapter.
 */
export function validateHarness(v: unknown, ctx: string): Scenario["harness"] {
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !(SUPPORTED_HARNESSES as readonly string[]).includes(v)) {
    throw new Error(`${ctx}: "harness" must be one of ${SUPPORTED_HARNESSES.join(", ")}`);
  }
  return v;
}

/**
 * Validate a step's optional `stdout` matcher — exactly one recognised form, by key
 * precedence (`empty` > `contains` > `regex` > `jsonPath`). Fails fast (located, named)
 * instead of casting a malformed matcher into an opaque crash in matchStdout's jsonPath branch.
 */
function validateStdout(v: unknown, ctx: string): StepExpect["stdout"] {
  if (v === undefined) return undefined;
  const o = asObject(v, `${ctx} expect.stdout`);
  if (o.empty === true) return { empty: true };
  if (typeof o.contains === "string") return { contains: o.contains };
  if (typeof o.regex === "string") return { regex: o.regex };
  if (typeof o.jsonPath === "string") return { jsonPath: o.jsonPath, equals: o.equals };
  throw new Error(`${ctx} expect.stdout must have one of: empty:true, contains, regex, or jsonPath`);
}

/** Validate one step's `expect` block (asserts only the fields present). */
function validateExpect(v: unknown, ctx: string): StepExpect {
  const o = asObject(v, `${ctx} expect`);
  if (o.exit !== undefined && typeof o.exit !== "number") throw new Error(`${ctx} expect.exit must be a number`);
  return { exit: o.exit as number | undefined, stdout: validateStdout(o.stdout, ctx) };
}

/** Upper bound (ms) on a step's `delayMs`: a real burst gap is ~2s; the sim sets an explicit 30s per-test timeout (simulator.test.ts), so this cap just fails a wild value at load instead of hanging CI. */
const MAX_DELAY_MS = 4_000;

/** Validate one step (scope string, event object, expect block, bounded delay). */
export function validateStep(v: unknown, ctx: string): Step {
  const o = asObject(v, ctx);
  if (typeof o.scope !== "string") throw new Error(`${ctx}.scope must be a string`);
  if (o.delayMs !== undefined && (typeof o.delayMs !== "number" || o.delayMs < 0 || o.delayMs > MAX_DELAY_MS)) throw new Error(`${ctx}.delayMs must be a number in [0, ${MAX_DELAY_MS}]`);
  return { scope: o.scope, event: asObject(o.event, `${ctx}.event`), expect: validateExpect(o.expect, ctx), delayMs: typeof o.delayMs === "number" ? o.delayMs : undefined };
}

/** Validate the optional `setup` array (each entry: string `path` + string `content`). */
export function validateSetup(v: unknown, ctx: string): Scenario["setup"] {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) throw new Error(`${ctx}: "setup" must be an array`);
  return v.map((f, i) => {
    const o = asObject(f, `${ctx} setup[${i}]`);
    if (typeof o.path !== "string" || typeof o.content !== "string") throw new Error(`${ctx} setup[${i}] needs string path + content`);
    return { path: o.path, content: o.content };
  });
}
