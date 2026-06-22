/** Exa MCP tools whose result count is capped (Context7 has no verbosity knob). */
const EXA_TOOLS = /exa__web_search|exa__get_code_context|exa_web_search|exa_get_code_context/i;

/** Max results an exa MCP call may request. */
export const MAX_EXA_RESULTS = 3;

/**
 * Cap an exa MCP call to {@link MAX_EXA_RESULTS} results. Returns the capped
 * input (a mutation for the harness to apply) when a cap is needed, else null.
 */
export function capVerbosity(tool: string, input: Record<string, unknown>): Record<string, unknown> | null {
  if (!EXA_TOOLS.test(tool)) return null;
  const n = input.numResults;
  if (typeof n === "number" && n <= MAX_EXA_RESULTS) return null;
  return { ...input, numResults: MAX_EXA_RESULTS };
}
