import { routeReferences } from "../refs/router";
import type { Prompt } from "../prompt/types";
import { DEFAULT_TTL_SEC, ttlLabel } from "../config/ttl";
import { PLUGINS_DIR, SOLID_REF } from "./file-size";
import type { ApexContext, ApexGate } from "./apex";

/** Gate: the routed SOLID references for this edit must have been read. */
export const solidReadGate: ApexGate = (ctx: ApexContext) => {
  if (!ctx.refs?.length) return null;
  const routed = routeReferences(ctx.refs, ctx.filePath, ctx.content);
  const ttl = ttlLabel(Math.round((ctx.windowMs ?? DEFAULT_TTL_SEC * 1000) / 1000));
  if (!routed) {
    // Parity require-solid-read.py::_build_reason (the `not routed` branch):
    // refs ARE loaded but none score for this file — Python still denies here,
    // pointing at the framework's SKILL.md. Note: `!ctx.refs?.length` above
    // (no refs installed at all) intentionally stays allow — discoverRefs()'s
    // documented contract ("with no refs the SOLID-read gate stays off").
    const ref = SOLID_REF[ctx.framework] ?? "generic/";
    return {
      kind: "block",
      title: `APEX: no SOLID reference matched ${ctx.filePath}`,
      reason: `${ctx.refs.length} SOLID reference(s) are loaded but none scored for this edit (expires every ${ttl}) — read the framework skill directly instead.`,
      actions: [`Read ${PLUGINS_DIR}/${ref}SKILL.md`],
    };
  }
  const read = new Set(ctx.refsRead ?? []);
  const missing = routed.required.map((r) => r.meta.filePath).filter((p) => !read.has(p));
  if (missing.length === 0) return null;
  const optional = routed.optional.map((r) => r.meta.filePath);
  const reason = [
    `Read these before editing ${ctx.filePath} (expires every ${ttl}):`,
    ...(optional.length ? [`Optional: ${optional.join(", ")}`] : []),
    `Full skill: ${routed.skillPath}`,
  ].join("\n");
  return {
    kind: "block",
    title: `APEX: read SOLID references for ${ctx.framework}`,
    reason,
    actions: missing,
  };
};

/** Gate: the required prior agents (explore + research) must have run within the window. */
export const freshnessGate: ApexGate = (ctx: ApexContext): Prompt | null => {
  if (ctx.agentsFresh !== false) return null;
  const missing = ctx.missingAgents?.length ? ctx.missingAgents : ["explore-codebase", "research-expert"];
  const ttl = ttlLabel(Math.round((ctx.windowMs ?? DEFAULT_TTL_SEC * 1000) / 1000));
  return {
    kind: "block",
    title: "APEX: explore + research required",
    reason: `Run ${missing.join(" and ")} within the freshness window (${ttl} TTL) before editing ${ctx.framework}.`,
    actions: missing.map((name) => `Launch the ${name} agent`),
  };
};
