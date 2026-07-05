import { test, expect } from "bun:test";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectGit } from "../src/runtime/lifecycle/snapshot/git";
import { collectVersion } from "../src/runtime/lifecycle/snapshot/version";
import { collectBoard } from "../src/runtime/lifecycle/snapshot/board";
import { renderSections, attachSnapshot } from "../src/runtime/lifecycle/snapshot/format";
import { renderSnapshot, withSnapshot } from "../src/runtime/lifecycle/snapshot/index";

const tmp = (p: string): string => mkdtempSync(join(tmpdir(), p));

/** A committed git repo with one staged + one untracked file. */
function repo(): string {
  const dir = tmp("fh-snap-git-");
  const g = `git -C ${dir} -c user.email=t@t -c user.name=t`;
  execSync(`${g} init -q -b work`);
  writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
  execSync(`${g} add a.ts && ${g} commit -qm init`);
  writeFileSync(join(dir, "b.ts"), "export const b = 2;\n"); // staged next
  execSync(`${g} add b.ts`);
  writeFileSync(join(dir, "c.ts"), "untracked\n"); // untracked
  return dir;
}

test("collectGit: branch, recent commit, WIP counts", () => {
  const out = collectGit(repo());
  expect(out).toContain("- branch: work");
  expect(out).toContain("init");
  expect(out).toContain("1 staged");
  expect(out).toContain("1 untracked");
});

test("collectGit: non-repo omits the section", () => {
  expect(collectGit(tmp("fh-snap-nogit-"))).toBe("");
});

test("collectVersion: harness line + drift flag vs project package.json", () => {
  const dir = tmp("fh-snap-ver-");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "9.9.9" }));
  const out = collectVersion(dir, import.meta.url);
  expect(out).toContain("- harness running: v");
  expect(out).toContain("v9.9.9 (DRIFT");
});

test("collectVersion: no project package.json → harness line only", () => {
  const out = collectVersion(tmp("fh-snap-ver2-"), import.meta.url);
  expect(out).toContain("- harness running: v");
  expect(out).not.toContain("project package.json");
});

test("collectBoard: injects BOARD.md + keep-current note", () => {
  const dir = tmp("fh-snap-board-");
  mkdirSync(join(dir, ".claude"));
  writeFileSync(join(dir, ".claude", "BOARD.md"), "# Board\n- [ ] ship snapshot\n");
  const out = collectBoard(dir);
  expect(out).toContain("keep current");
  expect(out).toContain("ship snapshot");
});

test("collectBoard: absent board → empty", () => {
  expect(collectBoard(tmp("fh-snap-board2-"))).toBe("");
});

test("renderSections: drops empty sections; all-empty → ''", () => {
  expect(renderSections([{ title: "A", body: "" }, { title: "B", body: "  " }])).toBe("");
  const r = renderSections([{ title: "Git", body: "x" }, { title: "V", body: "" }]);
  expect(r).toContain("# Reconciliation snapshot");
  expect(r).toContain("### Git");
  expect(r).not.toContain("### V");
});

test("attachSnapshot: concatenates onto existing additionalContext, never replaces", () => {
  const core = JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "PRIOR" } });
  const merged = JSON.parse(attachSnapshot(core, "SNAP")) as { hookSpecificOutput: { additionalContext: string } };
  expect(merged.hookSpecificOutput.additionalContext).toBe("PRIOR\n\nSNAP");
});

test("attachSnapshot: empty stdout → fresh contextResponse; empty snapshot → passthrough", () => {
  expect(attachSnapshot("", "SNAP")).toContain("SNAP");
  expect(attachSnapshot("KEEP", "")).toBe("KEEP");
});

test("attachSnapshot: unparseable non-empty stdout is preserved verbatim (never discards CLAUDE.md)", () => {
  // Invariant: a fresh response here would drop prior injected context — sacrifice the snapshot, not the stdout.
  expect(attachSnapshot("not-json-CLAUDEMD", "SNAP")).toBe("not-json-CLAUDEMD");
});

test("renderSnapshot + withSnapshot: git repo yields a snapshot merged into stdout", () => {
  const dir = repo();
  expect(renderSnapshot(dir, import.meta.url)).toContain("### Git");
  const merged = withSnapshot("", dir, import.meta.url);
  expect(merged).toContain("Reconciliation snapshot");
});
