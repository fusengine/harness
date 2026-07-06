/**
 * @module test/sim/load
 * Scenario loading and placeholder substitution. Pure — no spawn, no filesystem
 * beyond reading the scenario file — so it is unit-testable in isolation from the
 * binary under test. Field-level validators live in ./validate (SRP split):
 * load.ts orchestrates file->Scenario, ./validate owns the per-field rules.
 */
import { readFileSync } from "node:fs";
import type { Scenario } from "./types";
import { asObject, validateHarness, validateSetup, validateStep } from "./validate";

/** Validate a parsed scenario against {@link Scenario}. Throws on any schema breach. */
export function validateScenario(data: unknown, path: string): Scenario {
  const o = asObject(data, `scenario ${path}`);
  if (typeof o.name !== "string") throw new Error(`scenario ${path}: "name" must be a string`);
  if (!Array.isArray(o.steps) || o.steps.length === 0) throw new Error(`scenario ${path}: "steps" must be a non-empty array`);
  const steps = o.steps.map((s, i) => validateStep(s, `scenario ${path} step ${i + 1}`));
  const env = o.env === undefined ? undefined : (asObject(o.env, `scenario ${path} env`) as Record<string, string>);
  return { name: o.name, harness: validateHarness(o.harness, `scenario ${path}`), env, setup: validateSetup(o.setup, `scenario ${path}`), steps };
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
