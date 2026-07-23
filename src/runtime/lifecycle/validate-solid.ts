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
 *
 * Detection rides the conventions module (MASKED content, column-0 anchored
 * for Go): the old naive regexes matched inside comments/strings and
 * indented locals — all killed. LEGACY-level detections keep the exact hard
 * deny (byte-parity); EXTENDED-level ones (Go `interface{` without the
 * space, Python `Protocol`) follow `FUSE_CONVENTIONS_MODE` — advisory
 * (non-blocking additionalContext) by default, deny only on `"deny"`
 * (owner Amendment 5, external audit D0.2).
 */
import { contextResponse, denyResponse } from "../../adapters/claude";
import { interfaceDeclLevel } from "../../policy/conventions/interfaces";
import { conventionsMode } from "../../policy/conventions/verdict";

/** Go: deny a top-level interface declared outside `/interfaces/`. */
function checkGo(filePath: string, content: string, env: Record<string, string | undefined>): string | null {
  if (!filePath.endsWith(".go") || filePath.includes("/interfaces/")) return null;
  const level = interfaceDeclLevel(filePath, content);
  if (level === null) return null;
  const msg = "SOLID: Interfaces must be in internal/interfaces/";
  if (level === "legacy" || conventionsMode(env) === "deny") return denyResponse("PreToolUse", msg);
  return contextResponse("PreToolUse", msg);
}

/** Python: deny an ABC subclass declared outside `/interfaces/`. */
function checkPython(filePath: string, content: string, env: Record<string, string | undefined>): string | null {
  if (!filePath.endsWith(".py") || filePath.includes("/interfaces/")) return null;
  const level = interfaceDeclLevel(filePath, content);
  if (level === null) return null;
  const msg = "SOLID: Abstract classes must be in src/interfaces/";
  if (level === "legacy" || conventionsMode(env) === "deny") return denyResponse("PreToolUse", msg);
  return contextResponse("PreToolUse", msg);
}

/** `SOLID_PROJECT_TYPE` values this gate validates (parity subset — see module doc). */
const VALIDATORS: Record<string, (filePath: string, content: string, env: Record<string, string | undefined>) => string | null> = {
  go: checkGo,
  python: checkPython,
};

/**
 * Deny (or advise on) a Write/Edit that violates the Go/Python interface-location SOLID rule.
 * @param tool - The tool name (only "Write"/"Edit" are checked).
 * @param filePath - The written file's absolute path.
 * @param content - The written/edited content (`new_string` snippet on Edit).
 * @param env - Environment (defaults to `process.env`).
 * @returns The PreToolUse response, or `""` when clean/inert.
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
  return VALIDATORS[ptype]?.(filePath, content, env) ?? "";
}
