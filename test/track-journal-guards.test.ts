/**
 * G2/G3/G4 guarantees for the track journal: G2 differential oracle (journal
 * fold == legacy locked RMW, deep-equal on seeded sequences); G3 permutation
 * invariance for DISTINCT-ts event logs (what the seeded generator produces);
 * G4 CRDT (commutativity, union/max idempotence, batch == incremental fold).
 * Seeded generators only (mulberry32) — deterministic, no Math.random.
 */
import { test, expect } from "bun:test";
import { join } from "node:path";
import { loadTrack, withTrack } from "../src/tracking/store";
import { foldEvents, signEvent, type TrackEvent } from "../src/tracking/track-journal";
import { recordAgent, recordBrainstormRequired, recordDoc, recordRefRead, recordTarget, recordTrivialEdit, type SessionTrack } from "../src/tracking/session-state";
import { recordReceipt } from "../src/tracking/receipts";
import { dir, rng, withEnv } from "./helpers/track-env";

const BASE = 1_700_000_000_000;
type Op = (t: SessionTrack, ts: number) => SessionTrack;

/** Seeded mixed-mutation sequences (refs, agents, trivial, receipts, target, doc, brainstorm). */
function genOps(seed: number, n: number): Op[] {
  const r = rng(seed), ops: Op[] = [];
  const pick = (xs: string[]): string => xs[Math.floor(r() * xs.length)]!;
  for (let i = 0; i < n; i++) {
    const k = Math.floor(r() * 7);
    if (k === 0) { const p = `/r/${pick(["a", "b", "c"])}.md`; ops.push((t, ts) => recordRefRead(t, p, ts)); }
    else if (k === 1) { const nm = pick(["subagent-research-expert", "subagent-explore-codebase"]); ops.push((t, ts) => recordAgent(t, nm, ts, "sufficient")); }
    else if (k === 2) ops.push((t, ts) => recordTrivialEdit(t, ts, 120_000, ts));
    else if (k === 3) ops.push((t, ts) => recordReceipt(t, { kind: "tsc", exitCode: 0, ts }));
    else if (k === 4) { const f = pick(["react", "laravel"]); ops.push((t, ts) => recordTarget(t, { project: "/p", framework: f, set_by: "t", set_at: new Date(ts).toISOString() })); }
    else if (k === 5) { const f = pick(["react", "laravel"]); const s = pick(["exa", "context7"]); ops.push((t, ts) => recordDoc(t, f, "s1", s, ts)); }
    else { const v = r() > 0.5; ops.push((t) => recordBrainstormRequired(t, v)); }
  }
  return ops;
}

/** Seeded raw signed events covering every field/op, strictly increasing ts. */
function genEvents(seed: number, n: number): TrackEvent[] {
  const r = rng(seed), out: TrackEvent[] = [];
  const push = (e: TrackEvent | null): void => { if (e) out.push(e); };
  for (let i = 0; i < n; i++) {
    const ts = BASE + i * 7, k = Math.floor(r() * 8);
    if (k === 0) push(signEvent("refsRead", "add", `/r/${i % 4}.md`, ts));
    else if (k === 1) push(signEvent("refsReadAt", "max", [`/r/${i % 4}.md`, ts], ts));
    else if (k === 2) push(signEvent("agents", "append", { name: `a${i % 3}`, ts }, ts));
    else if (k === 3) push(signEvent("receipts", "append", { kind: "tsc", exitCode: 0, ts }, ts));
    else if (k === 4) push(signEvent("authorizations", "merge", { key: `f${i % 2}`, entry: { doc_sessions: [`s${i % 2}`], sources: ["exa"], doc_consulted: new Date(ts).toISOString() } }, ts));
    else if (k === 5) push(signEvent("trivialEdits", "add", ts, ts));
    else if (k === 6) push(signEvent("target", "set", { project: "/p", framework: "react", set_by: "t", set_at: new Date(ts).toISOString() }, ts));
    else push(signEvent("brainstormRequired", "set", i % 2 === 0, ts));
  }
  return out;
}

function shuffle<T>(xs: T[], seed: number): T[] {
  const r = rng(seed), out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}

test("G2 oracle: journal fold == legacy locked RMW, deep-equal over seeded sequences", async () => {
  for (let seed = 1; seed <= 12; seed++) {
    const ops = genOps(seed, 30);
    const legacyFile = join(dir(), "track.json"), journalFile = join(dir(), "track.json");
    await withEnv("0", async () => { for (const [i, op] of ops.entries()) await withTrack(legacyFile, (t) => op(t, BASE + i * 1000)); });
    await withEnv(undefined, async () => { for (const [i, op] of ops.entries()) await withTrack(journalFile, (t) => op(t, BASE + i * 1000)); });
    const legacy = await withEnv("0", () => loadTrack(legacyFile));
    const journal = await withEnv(undefined, () => loadTrack(journalFile));
    expect(journal).toEqual(legacy);
  }
});

test("G3 property: permutation invariance for DISTINCT-ts event logs (seeded shuffles)", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const events = genEvents(seed, 60);
    const want = foldEvents(events);
    for (let p = 1; p <= 8; p++) expect(foldEvents(shuffle(events, seed * 100 + p))).toEqual(want);
  }
});

test("G4 CRDT: commutativity, idempotence (union/max), batch == incremental fold", () => {
  const events = genEvents(99, 40);
  const want = foldEvents(events);
  expect(foldEvents(shuffle(events, 7))).toEqual(want); // commutativity
  const mid = Math.floor(events.length / 2);
  expect(foldEvents(events.slice(mid), foldEvents(events.slice(0, mid)))).toEqual(want); // compaction soundness
  const add = signEvent("refsRead", "add", "dup.md", BASE)!;
  const max = signEvent("refsReadAt", "max", ["dup.md", BASE], BASE)!;
  expect(foldEvents([add, add])).toEqual(foldEvents([add])); // union idempotent
  expect(foldEvents([max, max])).toEqual(foldEvents([max])); // max idempotent
  const agent = signEvent("agents", "append", { name: "a", ts: BASE }, BASE)!;
  expect(foldEvents([agent, agent]).agents).toHaveLength(2); // agents are NEVER deduped
});
