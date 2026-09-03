/**
 * The PreToolUse ownership decision. Everything it needs is passed in — no
 * I/O. Pure functions over already-loaded router/task-PRD/bindings data.
 */
import type { PrdIdentity, PrdOwnershipVerdict, PrdPathKind, PrdTaskFile } from "./interfaces/types";

/** True when `name === agentType`, or `"<agentType>-<n>"` with `n >= 2`. */
export function matchesAgentName(name: string, agentType: string): boolean {
  if (name === agentType) return true;
  if (!name.startsWith(agentType)) return false;
  const suffix = name.slice(agentType.length);
  if (!suffix.startsWith("-")) return false;
  const numPart = suffix.slice(1);
  return /^\d+$/.test(numPart) && Number(numPart) >= 2;
}

/** Agent names in `taskFile` whose name matches `agentType` (base or `-n` suffixed). */
export function candidateAgentNames(agentType: string, taskFile: PrdTaskFile): string[] {
  return Object.keys(taskFile).filter((name) => matchesAgentName(name, agentType));
}

/**
 * agentId -> bound name resolution. `bindings` is the journal's `prdOwners`
 * map (agentId -> name), read-only here. Returns the candidate already
 * bound to this agentId, or the SOLE still-unbound candidate (free to bind
 * now), or `null` (ambiguous: >1 free candidate, or 0 candidates at all).
 */
export function resolveOwnerBinding(
  candidates: string[],
  agentId: string,
  bindings: Record<string, string>,
): { name: string; alreadyBound: boolean } | null {
  const boundToMe = bindings[agentId];
  if (boundToMe !== undefined && candidates.includes(boundToMe)) {
    return { name: boundToMe, alreadyBound: true };
  }
  const takenByOthers = new Set(
    Object.entries(bindings).filter(([id]) => id !== agentId).map(([, name]) => name),
  );
  const free = candidates.filter((c) => !takenByOthers.has(c));
  if (free.length !== 1) return null;
  const [name] = free;
  return name === undefined ? null : { name, alreadyBound: false };
}

const COORDINATOR_ONLY_LABEL: Record<"router" | "task" | "docs", string> = {
  router: "router",
  task: "task PRD",
  docs: "docs",
};

function evaluateCoordinatorOnly(kind: "router" | "task" | "docs", identity: PrdIdentity): PrdOwnershipVerdict {
  if (identity.lead === true) return { allow: true };
  if (identity.lead === "unknown") return { allow: "advisory" };
  return { allow: false, reason: `${COORDINATOR_ONLY_LABEL[kind]} is coordinator-only` };
}

function evaluateAgentReport(
  agent: string,
  identity: PrdIdentity,
  taskFile: PrdTaskFile | null,
  bindings: Record<string, string>,
): PrdOwnershipVerdict {
  if (identity.lead === true) return { allow: false, reason: "agent report is not the coordinator's to write" };
  if (identity.lead === "unknown") return { allow: "advisory" };
  if (identity.agentType === undefined || identity.agentId === undefined) {
    return { allow: false, reason: "unidentifiable agent_type — cannot verify ownership" };
  }
  const candidates = candidateAgentNames(identity.agentType, taskFile ?? {});
  const resolved = resolveOwnerBinding(candidates, identity.agentId, bindings);
  if (!resolved || resolved.name !== agent) {
    return { allow: false, reason: "name doesn't match your agent_type, or already bound to another agent" };
  }
  return resolved.alreadyBound
    ? { allow: true }
    : { allow: true, bind: { agentId: identity.agentId, name: resolved.name } };
}

/**
 * Top-level PreToolUse verdict for ONE file path already known to be in
 * scope (`classifyPrdPath` returned non-`"other"`/non-`null` upstream).
 */
export function evaluateWriteOwnership(input: {
  kind: PrdPathKind;
  identity: PrdIdentity;
  taskFile: PrdTaskFile | null;
  bindings: Record<string, string>;
}): PrdOwnershipVerdict {
  const { kind, identity, taskFile, bindings } = input;

  if (kind.kind === "router" || kind.kind === "task" || kind.kind === "docs") {
    return evaluateCoordinatorOnly(kind.kind, identity);
  }
  if (kind.kind === "agentReport") {
    return evaluateAgentReport(kind.agent, identity, taskFile, bindings);
  }
  if (identity.lead === "unknown") return { allow: "advisory" };
  return { allow: false, reason: "not a recognized PRD file" };
}
