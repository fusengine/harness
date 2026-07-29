import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDesignState, saveDesignState, initDesignState } from "../src/policy/design/state";
import { recordPost } from "../src/runtime/design-helpers";
import type { NormalizedEvent } from "../src/runtime/normalize";

/**
 * POST validity transitions (C1/C3): the POST must not revoke what the PRE
 * allowed. Degrade only on problems an Edit INTRODUCED; never on a benign
 * legacy edit, never on an unreadable file.
 */
const tmp = (): string => mkdtempSync(join(tmpdir(), "fh-pv-"));
const URL_DS = "## Design Reference\nInspiration: https://boulangerie-dupont.fr\n--a: oklch(0.62 0.19 250);\n--font: \"Fraunces\";";
const LEGACY = "## Design Reference\n--a: #3366ff;\n--font: \"Fraunces\";";

function setup(content: string): { cache: string; f: string } {
  const cache = tmp();
  const f = join(tmp(), "design-system.md");
  writeFileSync(f, content);
  saveDesignState(cache, { ...initDesignState("a", "page", true), currentPhase: 3, designSystemValid: true });
  return { cache, f };
}
const editEv = (f: string, oldString: string, newString: string): NormalizedEvent =>
  ({ phase: "post", tool: "Edit", input: { old_string: oldString, new_string: newString }, sessionId: "s", filePath: f, oldString, content: newString });

test("C1: a benign Edit on a legacy invalid file does NOT revoke validity (PRE allowed it)", () => {
  const { cache, f } = setup(LEGACY.replace("#3366ff", "#445566")); // on-disk = post-edit content
  recordPost(editEv(f, "--a: #3366ff;", "--a: #445566;"), cache, loadDesignState(cache, "a")!, "", false);
  const s = loadDesignState(cache, "a")!;
  expect(s.designSystemValid).toBe(true);
  expect(s.currentPhase).toBe(3);
});

test("C1: an Edit that INTRODUCES a defect revokes validity (phase 3 blocked downstream)", () => {
  const { cache, f } = setup(URL_DS.replace("oklch(0.62 0.19 250)", "#3366ff"));
  recordPost(editEv(f, "--a: oklch(0.62 0.19 250);", "--a: #3366ff;"), cache, loadDesignState(cache, "a")!, "", false);
  expect(loadDesignState(cache, "a")!.designSystemValid).toBe(false);
});

test("POST nominal: reverse reconstruction treats $ in old_string as DATA (a $& there must not mask the introduced problem)", () => {
  // Original: valid, with a harmless "$&" in a comment. The edit swaps the font
  // for a forbidden one. Literal reverse-rebuild: original clean → introduced
  // [forbidden font] → revoke. String-replacement would expand $& to the match
  // (the Inter line), making the ORIGINAL look invalid too → no revoke (mutation).
  const { cache, f } = setup(`${URL_DS}\n--font-x: "Inter"; /* $& */`);
  recordPost(editEv(f, `--font-x: "Fraunces"; /* $& */`, `--font-x: "Inter"; /* $& */`), cache, loadDesignState(cache, "a")!, "", false);
  expect(loadDesignState(cache, "a")!.designSystemValid).toBe(false);
});

test("POST replace_all: same literal rule on every occurrence", () => {
  const { cache, f } = setup(`${URL_DS}\n--font-x: "Inter"; /* $& */\n--font-x: "Inter"; /* $& */`);
  const ev: NormalizedEvent = { phase: "post", tool: "Edit", input: { old_string: `--font-x: "Fraunces"; /* $& */`, new_string: `--font-x: "Inter"; /* $& */`, replace_all: true }, sessionId: "s", filePath: f, oldString: `--font-x: "Fraunces"; /* $& */`, content: `--font-x: "Inter"; /* $& */` };
  recordPost(ev, cache, loadDesignState(cache, "a")!, "", false);
  expect(loadDesignState(cache, "a")!.designSystemValid).toBe(false);
});

test("C3: an unreadable design-system.md leaves the state untouched (unreadable ≠ invalid)", () => {
  const cache = tmp();
  saveDesignState(cache, { ...initDesignState("a", "page", true), currentPhase: 3, designSystemValid: true });
  const gone = join(tmp(), "design-system.md"); // never written
  const ev: NormalizedEvent = { phase: "post", tool: "Write", input: {}, sessionId: "s", filePath: gone, content: "x" };
  recordPost(ev, cache, loadDesignState(cache, "a")!, "", false);
  const s = loadDesignState(cache, "a")!;
  expect(s.designSystemValid).toBe(true);
  expect(s.currentPhase).toBe(3);
});
