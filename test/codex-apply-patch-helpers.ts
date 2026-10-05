/**
 * @module test/codex-apply-patch-helpers
 * Shared fixtures for the Codex `apply_patch` skill/APEX parity tests: seeded scenario
 * generator, isolated project + session-track setup, per-language bodies, CLI runner.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyTrack, recordAgent, recordBrainstormRequired, recordDoc, recordTrivialEdit } from "../src/tracking/session-state";
import { saveTrack } from "../src/tracking/store";
import type { GateInput } from "../src/runtime/gate-input";
import type { Prompt } from "../src/prompt/types";

export const NOW = 1_800_000_000_000;
export const WINDOW = 900_000;

/** Isolated HOME + project parent, created once per test file. */
export const home: string = mkdtempSync(join(tmpdir(), "fh-apx-home-"));
const root: string = mkdtempSync(join(tmpdir(), "fh-apx-"));
let dirSeq = 0;

/** Deterministic PRNG (mulberry32) so a failure is reproducible from its seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

export type Manifest = "none" | "react" | "swift" | "php";
/** One generated session state + file write. */
export interface Scenario { manifest: Manifest; docFw: string; rel: string; op: "add" | "update"; lines: number; explore: boolean; research: boolean; doc: boolean; brainstorm: boolean; agentId?: string; priorTrivial: number }

/**
 * Draw one scenario.
 * @param r - Seeded PRNG.
 */
export function scenario(r: () => number): Scenario {
  return {
    manifest: pick(r, ["none", "react", "swift", "php"] as const),
    // The framework whose docs the session consulted — may differ from the file's own (the per-file detection must then deny).
    docFw: pick(r, ["generic", "react", "swift", "php"]),
    rel: pick(r, ["src/calc.ts", "src/view.tsx", "Sources/App/HaloView.swift", "src/Thing.php", "notes.md", "CHANGELOG.md", "node_modules/x/a.ts"]),
    op: pick(r, ["add", "update"] as const),
    lines: pick(r, [2, 3, 8, 12]),
    explore: r() < 0.5, research: r() < 0.5, doc: r() < 0.5, brainstorm: r() < 0.3,
    agentId: r() < 0.3 ? "agent-1" : undefined,
    priorTrivial: pick(r, [0, 2, 3, 4]),
  };
}

/** A trivial (2-line) update on a plain TS file, fresh session, no evidence. */
export const TRIVIAL: Scenario = { manifest: "none", docFw: "generic", rel: "src/calc.ts", op: "update", lines: 2, explore: false, research: false, doc: false, brainstorm: false, priorTrivial: 0 };

const MANIFESTS: Record<Manifest, [string, string] | null> = {
  none: null,
  react: ["package.json", '{"name":"app","dependencies":{"react":"19.0.0"}}'],
  swift: ["Package.swift", '// swift-tools-version:6.0\nimport PackageDescription\nlet package = Package(name: "App")\n'],
  php: ["composer.json", '{"require":{"php":">=8.3"}}'],
};

/**
 * A fresh project + session track holding the scenario's evidence. Both sides of a
 * comparison share ONE random parent with fixed child names, so path-keyed gates
 * (e.g. shadcn's /ui|components/ match) see the same path on both sides.
 * @param s - The scenario.
 * @param tag - Child-dir prefix (no letters a path-keyed gate could match).
 */
export async function setup(s: Scenario, tag: string): Promise<{ cwd: string; trackFile: string; abs: string }> {
  const cwd = join(root, `${tag}${++dirSeq}`);
  mkdirSync(cwd, { recursive: true });
  const manifest = MANIFESTS[s.manifest];
  if (manifest) writeFileSync(join(cwd, manifest[0]), manifest[1]);
  const abs = join(cwd, s.rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  if (s.op === "update") writeFileSync(abs, "/** Existing. */\nexport const seed = 1;\n");
  let t = recordBrainstormRequired(emptyTrack(), s.brainstorm);
  if (s.explore) t = recordAgent(t, "explore-codebase", NOW - 1000, "sufficient");
  if (s.research) t = recordAgent(t, "research-expert", NOW - 1000, "sufficient");
  if (s.doc) for (const src of ["context7", "exa"]) t = recordDoc(t, s.docFw, "s1", src, NOW - 1000);
  for (let i = 0; i < s.priorTrivial; i++) t = recordTrivialEdit(t, NOW - 5000 + i, WINDOW, NOW);
  const trackFile = join(cwd, ".state", "track-s1.json");
  mkdirSync(join(cwd, ".state"), { recursive: true });
  await saveTrack(trackFile, t);
  return { cwd, trackFile, abs };
}

/**
 * Unique, interface-free body so DRY / interface-separation never decide (they run in a
 * different order by design); per-language so the framework skill triggers really fire.
 */
export function body(n: number, salt: string, rel = ""): string {
  if (rel.endsWith(".swift")) return ["import SwiftUI", ...Array.from({ length: n - 1 }, (_, i) => `let v${salt}${i} = Text("x").padding(${i})`)].join("\n");
  if (rel.endsWith(".php")) return ["<?php", ...Array.from({ length: n - 1 }, (_, i) => `$v${salt}${i} = collect([${i}]);`)].join("\n");
  if (rel.endsWith(".tsx")) return Array.from({ length: n }, (_, i) => `export const V${salt}${i} = () => <div className="p-4 flex gap-2">{useState(${i})}</div>;`).join("\n");
  return Array.from({ length: n }, (_, i) => `export const v${salt}${i} = ${i};`).join("\n");
}

/** Gate input minus the tool; `framework` follows handle.ts (per file for Write/Edit, no file for apply_patch). */
export const base = (s: Scenario, cwd: string, trackFile: string, framework: string): Omit<GateInput, "tool"> => ({
  sessionId: "s1", framework, cwd, now: NOW, windowMs: WINDOW, trackFile, agentId: s.agentId,
});

/** Comparable verdict string. */
export const verdict = (p: Prompt | null): string => (p ? `${p.kind}|${p.title}` : "allow");

/**
 * Run the real CLI in a child with the isolated HOME — Bun caches os.homedir()
 * (oven-sh/bun#29244), so an in-process handleHook would write the real ~/.fuse-harness.
 */
export function hookCli(host: string, payload: Record<string, unknown>, cwd: string): string {
  const bin = join(import.meta.dir, "..", "src", "cli", "bin.ts");
  const r = Bun.spawnSync(["bun", bin, "hook", host, "core"], { cwd, env: { PATH: process.env.PATH ?? "", HOME: home }, stdin: Buffer.from(JSON.stringify(payload)), timeout: 30_000 });
  return r.stdout.toString();
}

/** A fresh empty project dir under the shared parent. */
export function freshDir(prefix: string): string {
  return mkdtempSync(join(root, prefix));
}
