import { formatDocDeny, isDocConsulted, type AuthEntry } from "../freshness/doc-helpers";
import { routeReferences } from "../refs/router";
import type { RefMeta } from "../refs/types";
import type { Prompt } from "../prompt/types";

/**
 * Session context for the stateful APEX gates. The harness adapter supplies this
 * (the package owns the gate LOGIC; recording the session activity is the
 * adapter's tracking layer).
 */
export interface ApexContext {
  sessionId: string;
  framework: string;
  filePath: string;
  content: string;
  /** Doc-consultation authorizations from session state (Context7/Exa). */
  authorizations?: Record<string, AuthEntry>;
  /** Available SOLID references for the framework's skill. */
  refs?: RefMeta[];
  /** Absolute paths of SOLID refs already read this session. */
  refsRead?: string[];
}

/** A single APEX gate: returns a blocking {@link Prompt}, or null to pass. */
export type ApexGate = (ctx: ApexContext) => Prompt | null;

/** Gate: Context7 + Exa must have been consulted this session. */
export const docConsultedGate: ApexGate = (ctx) =>
  isDocConsulted(ctx.authorizations, ctx.sessionId)
    ? null
    : {
        kind: "block",
        title: "APEX: documentation not consulted",
        reason: formatDocDeny(ctx.framework),
        actions: ["Call mcp__context7__query-docs", "Call mcp__exa__web_search_exa"],
      };

/** Gate: the routed SOLID references for this edit must have been read. */
export const solidReadGate: ApexGate = (ctx) => {
  if (!ctx.refs?.length) return null;
  const routed = routeReferences(ctx.refs, ctx.filePath, ctx.content);
  if (!routed) return null;
  const read = new Set(ctx.refsRead ?? []);
  const missing = routed.required.map((r) => r.meta.filePath).filter((p) => !read.has(p));
  if (missing.length === 0) return null;
  return {
    kind: "block",
    title: `APEX: read SOLID references for ${ctx.framework}`,
    reason: `Read these before editing ${ctx.filePath}:`,
    actions: missing,
  };
};

/** Default APEX gate chain. */
export const APEX_GATES: ReadonlyArray<ApexGate> = [docConsultedGate, solidReadGate];

/**
 * Run the APEX gates (chain-of-responsibility): the first failing gate's prompt
 * wins; null means every gate passed (allow).
 */
export function evaluateApex(ctx: ApexContext, gates: ReadonlyArray<ApexGate> = APEX_GATES): Prompt | null {
  return gates.reduce<Prompt | null>((hit, gate) => hit ?? gate(ctx), null);
}
