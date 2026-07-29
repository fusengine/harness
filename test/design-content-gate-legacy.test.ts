import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { designSystemContentGate } from "../src/runtime/design-helpers";
import { initDesignState, type DesignState } from "../src/policy/design/state";

/**
 * The not-worsening rule (D4): a legacy design-system.md that predates the
 * doctrine stays editable AND rewritable — a change is blocked only when it
 * INTRODUCES a violation the on-disk file did not already have.
 */
const ROOT = "/plugins/design-expert/skills/design-web/references/refs-design";
const READS = ["README.md", "umbrel-recode/tokens-umbrel.md", "fora-recode/tokens-fora.md"];
const state = (over: Partial<DesignState> = {}): DesignState =>
  ({ ...initDesignState("a", "full", false), currentPhase: 2, corpusReads: READS, ...over });
const base = { filePath: "", tool: "Write", oldString: undefined, replaceAll: false, corpusRoot: ROOT, corpusRequired: true };
const legacyFile = (content: string): string => {
  const f = join(mkdtempSync(join(tmpdir(), "fh-ds-")), "design-system.md");
  writeFileSync(f, content);
  return f;
};

test("Edit on a legacy invalid file is NOT blocked when it introduces nothing new", () => {
  const f = legacyFile("## Design Reference\nInspiration: https://boulangerie-dupont.fr\n--a: #3366ff;\n--font: \"Fraunces\";");
  const benign = designSystemContentGate({ ...base, filePath: f, tool: "Edit", content: "--b: #123456;", oldString: "--a: #3366ff;", state: state() });
  expect(benign).toBeNull();
});

test("Edit that INTRODUCES new problems on an already-invalid file is blocked", () => {
  // Already invalid (no reference source); the edit kills oklch AND adds a forbidden font declaration.
  const f = legacyFile("## Design Reference\n--a: oklch(0.62 0.19 250);\n--font: \"Fraunces\";");
  const p = designSystemContentGate({ ...base, filePath: f, tool: "Edit", content: "--a: #3366ff; --font-x: Inter;", oldString: "--a: oklch(0.62 0.19 250);", state: state() });
  expect(p?.kind).toBe("block");
});

test("Write over an existing legacy file follows the same not-worsening rule", () => {
  const legacy = "## Design Reference\n--a: #3366ff;\n--font: \"Fraunces\";";
  const f = legacyFile(legacy);
  // Byte-identical rewrite: allowed (no new problem).
  expect(designSystemContentGate({ ...base, filePath: f, content: legacy, state: state() })).toBeNull();
  // Improved but still imperfect (oklch added, source still missing): allowed.
  const improved = legacy.replace("--a: #3366ff;", "--a: oklch(0.62 0.19 250);");
  expect(designSystemContentGate({ ...base, filePath: f, content: improved, state: state() })).toBeNull();
  // Same rewrite plus a NEW violation: blocked.
  const degraded = `${legacy}\n--font-x: Inter;`;
  expect(designSystemContentGate({ ...base, filePath: f, content: degraded, state: state() })?.kind).toBe("block");
});
