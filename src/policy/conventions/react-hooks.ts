/**
 * Custom React hook declaration detection over MASKED content. Historical
 * rule (`framework-solid-gates.ts`): an exported custom hook belongs in
 * `hooks/` — the regex was naive (`^export (function|const) use[A-Z]`,
 * missing `export default`, `async`, and matching inside comments/strings).
 */
import { maskCommentsAndStrings } from "./strip";

/** Exported custom hook: `export [default] [async] function|const useX`. */
const HOOK_DECL_RE = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|const)\s+use[A-Z]\w*/m;

/**
 * True when the file declares an exported custom `use*` hook (masked scan).
 * @param content - Raw file content.
 */
export function declaresCustomHook(content: string): boolean {
  return HOOK_DECL_RE.test(maskCommentsAndStrings(content, "c"));
}
