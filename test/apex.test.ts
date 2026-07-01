import { test, expect } from "bun:test";
import { evaluateApex, docConsultedGate, solidReadGate, freshnessGate, type ApexContext } from "../src/policy/apex";
import { DEFAULT_TTL_SEC, ttlLabel } from "../src/config/ttl";
import type { RefMeta } from "../src/refs/types";

const sid = "s1";
const consulted = { react: { doc_sessions: [sid], sources: ["context7", "exa"] } };

function ref(name: string, level: string): RefMeta {
  return { name, description: "", keywords: "", priority: "", related: "", appliesTo: "**/*.ts", triggerOnEdit: "", level, filePath: `/p/${name}.md` };
}

const base: ApexContext = { sessionId: sid, framework: "react", filePath: "src/a.ts", content: "" };

test("docConsultedGate: block until Context7 + Exa consulted", () => {
  expect(docConsultedGate(base)?.kind).toBe("block");
  expect(docConsultedGate({ ...base, authorizations: consulted })).toBeNull();
});

test("solidReadGate: block until the required refs are read", () => {
  const refs = [ref("srp", "principle"), ref("tpl", "template")];
  const ctx = { ...base, authorizations: consulted, refs };
  const gate = solidReadGate(ctx);
  expect(gate?.kind).toBe("block");
  expect(gate?.actions?.length).toBe(2);
  expect(solidReadGate({ ...ctx, refsRead: gate?.actions })).toBeNull();
});

test("solidReadGate: no refs (empty or undefined) -> allow (discoverRefs contract, unchanged)", () => {
  expect(solidReadGate(base)).toBeNull();
  expect(solidReadGate({ ...base, refs: [] })).toBeNull();
});

test("solidReadGate: refs loaded but none route -> block pointing at the framework SKILL.md (FIX A)", () => {
  const gate = solidReadGate({ ...base, filePath: "src/a.py", refs: [ref("srp", "principle")] });
  expect(gate?.kind).toBe("block");
  expect(gate?.title).toContain("no SOLID reference matched");
  expect(gate?.actions?.[0]).toContain("solid-react/SKILL.md");
});

test("freshnessGate: names the precise missing agent(s), falls back to both when unspecified (FIX B)", () => {
  const denied: ApexContext = { ...base, agentsFresh: false };
  const generic = freshnessGate(denied);
  expect(generic?.reason).toContain("Run explore-codebase and research-expert within");
  expect(generic?.actions).toEqual(["Launch the explore-codebase agent", "Launch the research-expert agent"]);
  const one = freshnessGate({ ...denied, missingAgents: ["research-expert"] });
  expect(one?.reason).toContain("Run research-expert within");
  expect(one?.reason).not.toContain("explore-codebase");
  expect(one?.actions).toEqual(["Launch the research-expert agent"]);
});

test("freshnessGate: blocks when prior agents are not fresh", () => {
  expect(evaluateApex({ ...base, agentsFresh: false })?.title).toContain("explore");
});

test("freshnessGate: deny message labels the TTL from windowMs (parity AGENT_TTL_LABEL)", () => {
  const denied: ApexContext = { ...base, agentsFresh: false };
  // Runtime default window (DEFAULT_WINDOW_MS = 120000ms) renders as "2min".
  expect(freshnessGate({ ...denied, windowMs: 120_000 })?.reason).toContain("(2min TTL)");
  // A window that is not a whole number of minutes stays in seconds (ttlLabel parity),
  // never a wrong minute rounding.
  expect(freshnessGate({ ...denied, windowMs: 90_000 })?.reason).toContain("(90s TTL)");
  // No windowMs (as in the bare ApexContext used by other tests) falls back to
  // DEFAULT_TTL_SEC — derived, not hardcoded, so the assertion tracks the config
  // constant instead of drifting. Must never render "undefinedmin"/"NaNmin".
  const fallback = freshnessGate(denied)?.reason ?? "";
  expect(fallback).toContain(`(${ttlLabel(DEFAULT_TTL_SEC)} TTL)`);
  expect(fallback).not.toContain("undefined");
  expect(fallback).not.toContain("NaN");
});

test("evaluateApex: chain — doc gate first, then solid, else allow", () => {
  const refs = [ref("srp", "principle"), ref("tpl", "template")];
  expect(evaluateApex(base)?.title).toContain("documentation");
  const docOk = { ...base, authorizations: consulted, refs };
  expect(evaluateApex(docOk)?.title).toContain("SOLID");
  expect(evaluateApex({ ...docOk, refsRead: ["/p/srp.md", "/p/tpl.md"] })).toBeNull();
});
