/** Exa MCP tools whose result count + token budget are capped. */
const EXA_TOOLS = /exa__web_search|exa__get_code_context|exa_web_search|exa_get_code_context/i;
/** Context7 doc tool whose token budget is capped. */
const CONTEXT7_TOOLS = /context7__query-docs|context7_query-docs|query-docs/i;

/** Max results an exa MCP call may request. */
export const MAX_EXA_RESULTS = 3;
/** Max token budget for exa `tokensNum` / context7 `tokens`. */
export const MAX_TOKENS = 2000;

/**
 * Cap an MCP call's verbosity — exa `numResults` ≤ 3 (+ `tokensNum` ≤ 2000),
 * Context7 `tokens` ≤ 2000. Returns the capped input (a mutation for the harness
 * to apply) when a change is needed, else null.
 */
export function capVerbosity(tool: string, input: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = { ...input };
  let changed = false;
  const cap = (key: string, max: number, force: boolean): void => {
    const v = out[key];
    if ((typeof v === "number" && v > max) || (force && typeof v !== "number")) {
      out[key] = max;
      changed = true;
    }
  };
  if (EXA_TOOLS.test(tool)) {
    cap("numResults", MAX_EXA_RESULTS, true);
    cap("tokensNum", MAX_TOKENS, false);
  } else if (CONTEXT7_TOOLS.test(tool)) {
    cap("tokens", MAX_TOKENS, false);
  }
  return changed ? out : null;
}
