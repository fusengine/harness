/** Exa search tool — result count force-capped + token budget capped. */
const EXA_SEARCH = /exa__web_search|exa_web_search/i;
/** Exa code-context tool — token budget capped; `numResults` capped only when
 * already present (parity: limit-mcp-verbosity.py never injects it). */
const EXA_CODE = /exa__get_code_context|exa_get_code_context/i;
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
  if (EXA_SEARCH.test(tool)) {
    cap("numResults", MAX_EXA_RESULTS, true);
    cap("tokensNum", MAX_TOKENS, false);
  } else if (EXA_CODE.test(tool)) {
    cap("numResults", MAX_EXA_RESULTS, false);
    cap("tokensNum", MAX_TOKENS, false);
  } else if (CONTEXT7_TOOLS.test(tool)) {
    cap("tokens", MAX_TOKENS, false);
  }
  return changed ? out : null;
}
