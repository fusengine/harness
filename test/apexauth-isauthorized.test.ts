import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { apexAuthorizationGate, isAuthorized } from "../src/policy/apex-authorization";
import { emptyTrack, recordAgent, recordDoc, recordTarget, type SessionTrack } from "../src/tracking/session-state";
import { loadTrack } from "../src/tracking/store";
import { apexScopedGate } from "../src/runtime/gate-apex";
import type { GateInput } from "../src/runtime/gate-input";
import type { ApexContext } from "../src/policy/apex";

const NOW = 1_000_000_000_000;
const WINDOW = 120_000;
const sid = "s1";
const iso = (ms: number): string => new Date(ms).toISOString();
const fresh = (): string => join(mkdtempSync(join(tmpdir(), "fh-auth-")), "t.json");

/** Fresh explore+research evidence so the PRE gates pass and Check 1 is reached. */
function agentsOk(): SessionTrack {
  return recordAgent(recordAgent(emptyTrack(), "explore-codebase", NOW - 1000), "research-expert", NOW - 1000);
}

/** Per-framework edit fixtures (path + content drive detectFramework upstream; framework is explicit here). */
const FILES: Record<string, [string, string]> = {
  react: ["/proj/src/App.tsx", "export const A = 1;\n"],
  laravel: ["/proj/app/User.php", "<?php class User {}\n"],
  generic: ["/proj/tools/cli.py", "def run():\n    pass\n"],
};

function input(framework: string, file: string): GateInput {
  const [filePath, content] = FILES[framework] ?? ["/proj/a.ts", ""];
  return { sessionId: sid, framework, tool: "Write", filePath, content, now: NOW, windowMs: WINDOW, trackFile: file, cwd: "/proj" };
}

for (const fw of ["react", "laravel", "generic"]) {
  test(`Check 1 (${fw}): not consulted -> deny AND target persisted (parity :80-81)`, async () => {
    const file = fresh();
    const p = await apexScopedGate(input(fw, file), agentsOk(), WINDOW);
    expect(p?.kind).toBe("block");
    expect(p?.title).toBe(`APEX: ${fw} documentation required`);
    const saved = await loadTrack(file);
    expect(saved.target).toEqual({ project: "/proj", framework: fw, set_by: "apex-authorization", set_at: iso(NOW) });
  });

  test(`Check 1 (${fw}): fresh consultation -> pass`, async () => {
    let t = agentsOk();
    t = recordDoc(t, fw, sid, "context7", NOW - 1000);
    t = recordDoc(t, fw, sid, "exa", NOW - 1000);
    expect(await apexScopedGate(input(fw, fresh()), t, WINDOW)).toBeNull();
  });

  test(`Check 1 (${fw}): expired consultation (> TTL) -> deny again`, async () => {
    let t = agentsOk();
    t = recordDoc(t, fw, sid, "context7", NOW - WINDOW - 1);
    t = recordDoc(t, fw, sid, "exa", NOW - WINDOW - 1);
    const p = await apexScopedGate(input(fw, fresh()), t, WINDOW);
    expect(p?.title).toBe(`APEX: ${fw} documentation required`);
  });
}

test("isAuthorized: session + TTL matrix (parity enforce-apex-phases.ts isAuthorized)", () => {
  expect(isAuthorized(undefined, sid, NOW, WINDOW)).toBe(false);
  expect(isAuthorized({ doc_consulted: iso(NOW - 1), sessions: [sid] }, sid, NOW, WINDOW)).toBe(true);
  expect(isAuthorized({ doc_consulted: iso(NOW - WINDOW - 1), sessions: [sid] }, sid, NOW, WINDOW)).toBe(false);
  expect(isAuthorized({ doc_consulted: iso(NOW), sessions: ["other"] }, sid, NOW, WINDOW)).toBe(false);
  expect(isAuthorized({ doc_consulted: "not-a-date", sessions: [sid] }, sid, NOW, WINDOW)).toBe(false);
  expect(isAuthorized({ doc_consulted: iso(NOW), session: sid }, sid, NOW, WINDOW)).toBe(true); // legacy field
});

test("recordDoc: stamps doc_consulted + sessions alongside the Check-2 fields", () => {
  const t = recordDoc(emptyTrack(), "react", sid, "context7", NOW);
  expect(t.authorizations.react?.doc_consulted).toBe(iso(NOW));
  expect(t.authorizations.react?.sessions).toEqual([sid]);
  expect(t.authorizations.react?.doc_sessions).toEqual([sid]);
  expect(t.authorizations.react?.sources).toEqual(["context7"]);
});

test("cross-credit: deny on X wrote target -> a doc consult under Y credits X too, and target PERSISTS", () => {
  const target = { project: "/proj", framework: "laravel", set_by: "apex-authorization", set_at: iso(NOW - 1000) };
  let t = recordTarget(agentsOk(), target);
  t = recordDoc(t, "react", sid, "context7", NOW);
  expect(isAuthorized(t.authorizations.laravel, sid, NOW, WINDOW)).toBe(true); // no re-deny loop
  // Parity track-doc-consultation.py:62: the target is NEVER cleared by a credit — only the next deny replaces it.
  expect(t.target).toEqual(target);
});

test("cross-credit: an OLD target (set > TTL ago) is STILL credited and persists (no TTL on target.set_at)", () => {
  const target = { project: "", framework: "swift", set_by: "apex-authorization", set_at: iso(NOW - WINDOW - 1) };
  let t = recordTarget(emptyTrack(), target);
  t = recordDoc(t, "react", sid, "exa", NOW);
  // Parity: target carries NO TTL — a consultation landing > TTL after the deny still credits it (anti deny-loop).
  expect(t.authorizations.swift?.doc_consulted).toBe(iso(NOW));
  expect(t.target).toEqual(target);
});

test("apexAuthorizationGate: routed deny lists refs; a fresh skill-path read satisfies Check 1 (anti-loop)", () => {
  const ref = { name: "srp", description: "", keywords: "", priority: "", related: "", appliesTo: "**/*.ts", triggerOnEdit: "", level: "principle", filePath: "/skills/solid-react/references/srp.md" };
  const ctx: ApexContext = { sessionId: sid, framework: "react", filePath: "src/a.ts", content: "", refs: [ref], now: NOW, windowMs: WINDOW };
  expect(apexAuthorizationGate(ctx)?.actions).toEqual(["/skills/solid-react/references/srp.md"]);
  const read = { ...ctx, refsRead: [ref.filePath], refsReadAt: { [ref.filePath]: NOW - 1 } };
  expect(apexAuthorizationGate(read)).toBeNull();
});
