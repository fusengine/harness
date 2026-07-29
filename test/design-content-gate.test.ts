import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { designSystemContentGate } from "../src/runtime/design-helpers";
import { initDesignState, type DesignState } from "../src/policy/design/state";

const ROOT = "/plugins/design-expert/skills/design-web/references/refs-design";
const READS = ["README.md", "umbrel-recode/tokens-umbrel.md", "fora-recode/tokens-fora.md"];
const state = (over: Partial<DesignState> = {}): DesignState =>
  ({ ...initDesignState("a", "full", false), currentPhase: 2, corpusReads: READS, ...over });
const URL_DS = "## Design Reference\nInspiration: https://boulangerie-dupont.fr\n--a: oklch(0.62 0.19 250);\n--font: \"Fraunces\";";
const CORPUS_DS = "## Design Reference\n- Corpus: umbrel/## 4. Colors, fora/## 2. Colors\n--a: oklch(0.62 0.19 250);";
const base = { filePath: "/proj/design-system.md", tool: "Write", oldString: undefined, replaceAll: false, corpusRoot: ROOT, corpusRequired: true };

test("non design-system.md paths are not content-gated; a valid Write passes", () => {
  expect(designSystemContentGate({ ...base, filePath: "/proj/other.md", content: "", state: state() })).toBeNull();
  expect(designSystemContentGate({ ...base, content: URL_DS, state: state() })).toBeNull();
});

test("Write with invalid content is blocked and names what is missing", () => {
  const p = designSystemContentGate({ ...base, content: "# empty\n", state: state() });
  expect(p?.kind).toBe("block");
  expect(p?.reason).toContain("## Design Reference");
});

test("jointure: a corpus citation naming references actually read passes", () => {
  expect(designSystemContentGate({ ...base, content: CORPUS_DS, state: state() })).toBeNull();
});

test("jointure: citing a reference never read is blocked and names it", () => {
  const p = designSystemContentGate({ ...base, content: CORPUS_DS.replace("fora/", "xai/"), state: state() });
  expect(p?.kind).toBe("block");
  expect(p?.reason).toContain("xai");
});

test("corpus absent: the URL is mandatory again (fallback never weaker), jointure waived with a URL", () => {
  // Citation-only document, corpus absent → blocked: the citation door closes with the corpus.
  const citationOnly = CORPUS_DS.replace("fora/", "xai/");
  expect(designSystemContentGate({ ...base, content: citationOnly, state: state(), corpusRoot: "", corpusRequired: false })?.kind).toBe("block");
  // URL-sourced document with a bogus citation line, corpus absent → passes: no join check without a corpus.
  const withUrl = `${URL_DS}\n- Corpus: totally-made-up/whatever`;
  expect(designSystemContentGate({ ...base, content: withUrl, state: state(), corpusRoot: "", corpusRequired: false })).toBeNull();
});

test("Edit that BREAKS a valid file is blocked (worsening)", () => {
  const f = join(mkdtempSync(join(tmpdir(), "fh-ds-")), "design-system.md");
  writeFileSync(f, URL_DS);
  const p = designSystemContentGate({ ...base, filePath: f, tool: "Edit", content: "--a: #3366ff;", oldString: "--a: oklch(0.62 0.19 250);", state: state() });
  expect(p?.kind).toBe("block");
});

test("Edit validates the reconstructed result, not the fragment", () => {
  const f = join(mkdtempSync(join(tmpdir(), "fh-ds-")), "design-system.md");
  writeFileSync(f, URL_DS);
  const ok = designSystemContentGate({ ...base, filePath: f, tool: "Edit", content: "--b: oklch(0.5 0.1 200);", oldString: "--font: \"Fraunces\";", state: state() });
  expect(ok).toBeNull();
  const kill = designSystemContentGate({ ...base, filePath: f, tool: "Edit", content: "## Renamed", oldString: "## Design Reference", state: state() });
  expect(kill?.kind).toBe("block");
});

test("Edit replace_all substitutes every occurrence before validating", () => {
  const f = join(mkdtempSync(join(tmpdir(), "fh-ds-")), "design-system.md");
  writeFileSync(f, `${URL_DS}\n--font-x: "Inter"; --font-y: "Inter";`);
  const p = designSystemContentGate({ ...base, filePath: f, tool: "Edit", content: "Fraunces", oldString: "Inter", replaceAll: true, state: state() });
  expect(p).toBeNull();
});

test("Edit new_string with replacement metacharacters is validated LITERALLY ($& is not the match)", () => {
  const f = join(mkdtempSync(join(tmpdir(), "fh-ds-")), "design-system.md");
  writeFileSync(f, URL_DS);
  // The real Edit writes "$&" literally — the URL is gone. A gate that uses
  // String.replace's replacement semantics would reconstruct the UNCHANGED
  // file and allow: the bypass. Literal substitution must see the deletion.
  const p = designSystemContentGate({ ...base, filePath: f, tool: "Edit", content: "$&", oldString: "Inspiration: https://boulangerie-dupont.fr", state: state() });
  expect(p?.kind).toBe("block");
});

test("Edit replace_all with a metachar new_string substitutes LITERALLY (replaceAll would no-op on $&)", () => {
  const f = join(mkdtempSync(join(tmpdir(), "fh-ds-")), "design-system.md");
  writeFileSync(f, `${URL_DS}\nInspiration: https://boulangerie-dupont.fr (again)`);
  // Literal: both URLs become the text "$&" → no https:// left → invalid → block.
  // replaceAll(old, "$&") would interpret $& as the match → no-op → allow (the bypass).
  const p = designSystemContentGate({ ...base, filePath: f, tool: "Edit", content: "$&", oldString: "https://boulangerie-dupont.fr", replaceAll: true, state: state() });
  expect(p?.kind).toBe("block");
});

test("Edit with a stale old_string is blocked (re-read), never validated blind", () => {
  const f = join(mkdtempSync(join(tmpdir(), "fh-ds-")), "design-system.md");
  writeFileSync(f, URL_DS);
  const p = designSystemContentGate({ ...base, filePath: f, tool: "Edit", content: "x", oldString: "not in the file", state: state() });
  expect(p?.kind).toBe("block");
});
