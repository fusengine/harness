import { test, expect } from "bun:test";
import { solidReadGate, type ApexContext } from "../src/policy/apex";
import type { RefMeta } from "../src/refs/types";

const sid = "s1";
const consulted = { react: { doc_sessions: [sid], sources: ["context7", "exa"] } };

function ref(name: string, level: string, filePath: string): RefMeta {
  return { name, description: "", keywords: "", priority: "", related: "", appliesTo: "**/*.ts", triggerOnEdit: "", level, filePath };
}

const base: ApexContext = { sessionId: sid, framework: "react", filePath: "src/a.ts", content: "" };

const MARKET = "/Users/x/.claude/plugins/marketplaces/fusengine-plugins/plugins/solid/skills/solid-react/references";
const CACHE = "/Users/x/.claude/plugins/cache/fusengine-plugins/fuse-solid/1.0.12/skills/solid-react/references";

function refs(): RefMeta[] {
  return [ref("srp", "principle", `${MARKET}/srp.md`), ref("tpl", "template", `${MARKET}/tpl.md`)];
}

test("solidReadGate: lead non-regression — exact marketplace path read still credits", () => {
  const ctx = { ...base, authorizations: consulted, refs: refs() };
  expect(solidReadGate(ctx)?.kind).toBe("block");
  expect(solidReadGate({ ...ctx, refsRead: [`${MARKET}/srp.md`, `${MARKET}/tpl.md`] })).toBeNull();
});

test("solidReadGate: sub-agent reading the version-cache equivalent credits by skills/ suffix", () => {
  const ctx = { ...base, authorizations: consulted, refs: refs() };
  expect(solidReadGate({ ...ctx, refsRead: [`${CACHE}/srp.md`, `${CACHE}/tpl.md`] })).toBeNull();
});

test("solidReadGate: a forged /tmp/skills/... path does NOT credit — still blocks", () => {
  const ctx = { ...base, authorizations: consulted, refs: refs() };
  const gate = solidReadGate({
    ...ctx,
    refsRead: ["/tmp/skills/solid-react/references/srp.md", "/tmp/skills/solid-react/references/tpl.md"],
  });
  expect(gate?.kind).toBe("block");
});
