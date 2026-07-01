/**
 * PreToolUse (matcher "Write|Edit") for the solid scope: deny a Go top-level
 * interface or a Python `ABC` subclass defined outside its language's
 * `/interfaces/` directory. Ports `solid/scripts/validate-solid.py`'s
 * `check_go`/`check_python` only — its `check_nextjs`/`check_laravel`/
 * `check_swift` siblings are NOT ported here: they are a strict subset of the
 * already-ported `framework-solid-gates.ts` (react/nextjs/laravel/swift),
 * which fire unconditionally on file extension/content rather than being
 * gated behind `SOLID_PROJECT_TYPE`. Inert when `SOLID_PROJECT_TYPE` is
 * absent/"unknown"/nextjs/laravel/swift/rust (parity: the Python hook only
 * has a `go`/`python` validator).
 */
import { denyResponse } from "../../adapters/claude";

/** Top-level Go interface declaration, e.g. `type Foo interface {`. */
const GO_INTERFACE_RE = /^type.*interface \{/m;
/** Python class whose header mentions `ABC` (naive, parity with the Python regex). */
const PY_ABC_RE = /class.*ABC/;

/** Go: deny a top-level interface declared outside `/interfaces/`. */
function checkGo(filePath: string, content: string): string | null {
  if (!filePath.endsWith(".go") || filePath.includes("/interfaces/")) return null;
  return GO_INTERFACE_RE.test(content) ? "SOLID: Interfaces must be in internal/interfaces/" : null;
}

/** Python: deny an ABC subclass declared outside `/interfaces/`. */
function checkPython(filePath: string, content: string): string | null {
  if (!filePath.endsWith(".py") || filePath.includes("/interfaces/")) return null;
  return PY_ABC_RE.test(content) ? "SOLID: Abstract classes must be in src/interfaces/" : null;
}

/** `SOLID_PROJECT_TYPE` values this gate validates (parity subset — see module doc). */
const VALIDATORS: Record<string, (filePath: string, content: string) => string | null> = {
  go: checkGo,
  python: checkPython,
};

/**
 * Deny a Write/Edit that violates the Go/Python interface-location SOLID rule.
 * @param tool - The tool name (only "Write"/"Edit" are checked).
 * @param filePath - The written file's absolute path.
 * @param content - The written/edited content (`new_string` snippet on Edit).
 * @param env - Environment (defaults to `process.env`).
 * @returns The PreToolUse deny response, or `""` when clean/inert.
 */
export function validateSolidGate(
  tool: string,
  filePath: string,
  content: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const ptype = env.SOLID_PROJECT_TYPE ?? "";
  if (!ptype || ptype === "unknown") return "";
  if (tool !== "Write" && tool !== "Edit") return "";
  if (!filePath) return "";
  const violation = VALIDATORS[ptype]?.(filePath, content) ?? null;
  return violation ? denyResponse("PreToolUse", violation) : "";
}
