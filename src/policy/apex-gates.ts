import { routeReferences } from "../refs/router";
import { skillRefKey } from "../refs/ref-key";
import type { Prompt } from "../prompt/types";
import { DEFAULT_TTL_SEC, ttlLabel } from "../config/ttl";
import { PLUGINS_DIR, SOLID_REF } from "./file-size";
import type { ApexContext, ApexGate } from "./apex";

/**
 * True when the SOLID ref read at `path` still counts. Parity require-solid-read.py
 * `_check_solid_read` (FUSE_ENFORCE_TTL_SEC, default 120s): a SOLID read older than
 * the window has expired and must be redone. PARITY NOTE: the TTL applies ONLY to
 * this gate — Python TTL-izes SOLID reads exclusively; the other refsRead consumers
 * (skillTriggerGate, shadcn/tailwind/design gates) stay session-scoped, so this
 * predicate must never leak into them. Backward compat: a path with no `refsReadAt`
 * stamp (tracks recorded before the field existed) or a context without a clock
 * (`now` absent) counts as read.
 */
function refReadFresh(ctx: ApexContext, path: string, windowMs: number): boolean {
  const at = ctx.refsReadAt?.[path];
  return at === undefined || ctx.now === undefined || ctx.now - at < windowMs;
}

/** Gate: the routed SOLID references for this edit must have been read within the TTL. */
export const solidReadGate: ApexGate = (ctx: ApexContext) => {
  if (!ctx.refs?.length) return null;
  const routed = routeReferences(ctx.refs, ctx.filePath, ctx.content);
  const windowMs = ctx.windowMs ?? DEFAULT_TTL_SEC * 1000;
  const ttl = ttlLabel(Math.round(windowMs / 1000));
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
  // Only reads still inside the TTL window count — a stale read re-blocks
  // (parity require-solid-read.py, which re-validates the TTL on EVERY edit,
  // making the "(expires every …)" wording below actually true).
  const read = new Set((ctx.refsRead ?? []).filter((p) => refReadFresh(ctx, p, windowMs)));
  // A sub-agent/teammate reads the SAME skill material through a different
  // root than the marketplace-first path discoverRefs put in ctx.refs (a
  // version cache, or a standalone .codex/.cursor/.agents dir) — normalize
  // both sides to the `skills/<skill>/...` suffix so that read still credits.
  const readKeys = new Set([...read].map(skillRefKey).filter((k): k is string => k !== null));
  const credited = (path: string): boolean => {
    if (read.has(path)) return true;
    const key = skillRefKey(path);
    return key !== null && readKeys.has(key);
  };
  // Parity with the 3 other refsRead-consuming gates (skillTriggerGate's
  // `skills/${s}/` substring match, shadcnBaseSkillRead, designSkillRead):
  // reading the ref's PARENT SKILL.md counts as proof of consultation too,
  // not just the exact ref file path.
  const skillRead = !!routed.skillPath && credited(routed.skillPath);
  const missing = skillRead ? [] : routed.required.map((r) => r.meta.filePath).filter((p) => !credited(p));
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
