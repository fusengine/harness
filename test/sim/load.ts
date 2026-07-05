/**
 * @module test/sim/load
 * Scenario loading, structural validation, and placeholder substitution. Pure —
 * no spawn, no filesystem beyond reading the scenario file — so it is unit-testable
 * in isolation from the binary under test.
 */
import { readFileSync } from "node:fs";
import type { Scenario, Step, StepExpect } from "./types";

/** Assert `v` is a plain object, else throw a located error. */
function asObject(v: unknown, ctx: string): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error(`${ctx} must be an object`);
  return v as Record<string, unknown>;
}

/**
 * Validate a step's optional `stdout` matcher — exactly one recognised form,
 * checked by key presence in precedence order (`empty` > `contains` > `regex` >
 * `jsonPath`). Without this, a malformed matcher is cast blindly and later throws
 * an opaque `undefined.split` deep in {@link matchStdout}'s jsonPath branch; here
 * it fails fast, located and named.
 *
 * @param v   - Raw `expect.stdout` value from the scenario JSON.
 * @param ctx - Locating prefix for the thrown error.
 * @returns A validated {@link StepExpect.stdout}, or `undefined` when absent.
 * @throws Error when present but matching none of the four forms.
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

/** Validate one step (scope string, event object, expect block). */
function validateStep(v: unknown, ctx: string): Step {
  const o = asObject(v, ctx);
  if (typeof o.scope !== "string") throw new Error(`${ctx}.scope must be a string`);
  return { scope: o.scope, event: asObject(o.event, `${ctx}.event`), expect: validateExpect(o.expect, ctx) };
}

/** Validate a parsed scenario against {@link Scenario}. Throws on any schema breach. */
export function validateScenario(data: unknown, path: string): Scenario {
  const o = asObject(data, `scenario ${path}`);
  if (typeof o.name !== "string") throw new Error(`scenario ${path}: "name" must be a string`);
  if (!Array.isArray(o.steps) || o.steps.length === 0) throw new Error(`scenario ${path}: "steps" must be a non-empty array`);
  const steps = o.steps.map((s, i) => validateStep(s, `scenario ${path} step ${i + 1}`));
  const env = o.env === undefined ? undefined : (asObject(o.env, `scenario ${path} env`) as Record<string, string>);
  return { name: o.name, env, steps };
}

/** Read and structurally validate a scenario JSON file. Throws on bad JSON or schema. */
export function loadScenario(path: string): Scenario {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`scenario ${path}: invalid JSON — ${(e as Error).message}`);
  }
  return validateScenario(data, path);
}

/**
 * Recursively replace `$KEY` tokens (`$TMP`, `$FIXTURES`) in every string of a
 * JSON value, returning a fresh structure (the input is never mutated).
 *
 * @param value - Any JSON-shaped value (string, array, object, primitive).
 * @param vars  - Map of token name (without `$`) to replacement string.
 * @returns The value with all tokens substituted.
 */
export function substitute<T>(value: T, vars: Record<string, string>): T {
  if (typeof value === "string") {
    let s: string = value;
    for (const [k, v] of Object.entries(vars)) s = s.split(`$${k}`).join(v);
    return s as T;
  }
  if (Array.isArray(value)) return value.map((x) => substitute(x, vars)) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = substitute(v, vars);
    return out as T;
  }
  return value;
}
