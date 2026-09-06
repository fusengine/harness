import { test, expect } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyPatchGate } from "../src/runtime/apply-patch-gate";
import { parseApplyPatch } from "../src/adapters/codex/apply-patch";
import { evaluateFileSize } from "../src/policy/file-size";
import { root, wrap, fixture, filesFor, withMax200 } from "./apply-patch-shrink-helpers";

/** The challenger's exact bypass: 10 × "1 line -> line + bare `+` blank" plus one honest -3 removal. */
test("bypass regression: trailing bare `+` blank lines never under-count (205 + 10 - 3 = 212 -> denied, message says 212)", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "big.ts");
    writeFileSync(file, fixture(205));
    let body = `*** Update File: ${file}\n`;
    for (let i = 0; i < 10; i++) body += `@@\n-const l${i * 10} = ${i * 10};\n+const l${i * 10} = ${i * 10};\n+\n`;
    body += `@@\n const l150 = 150;\n-const l151 = 151;\n-const l152 = 152;\n-const l153 = 153;\n const l154 = 154;\n`;
    const prompt = applyPatchGate(filesFor(wrap(body)), cwd);
    expect(prompt).not.toBeNull();
    expect(prompt?.reason).toContain("212 lines");
  });
});

test("blank CONTEXT line at chunk end counts exactly once on both sides (205 -> 206, not 207)", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "big.ts");
    const body = fixture(204) + "\n"; // 204 code lines + 1 blank = 205 lines
    writeFileSync(file, body);
    const patch = wrap(`*** Update File: ${file}\n@@\n const l203 = 203;\n+const extra = 1;\n \n`);
    const prompt = applyPatchGate(filesFor(patch), cwd);
    expect(prompt).not.toBeNull();
    expect(prompt?.reason).toContain("206 lines");
    expect(prompt?.reason).not.toContain("207 lines");
  });
});

test("two identical chunks on the same file are never summed twice (fail-closed to the on-disk 205)", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "big.ts");
    writeFileSync(file, fixture(205));
    const chunk = `@@\n const l10 = 10;\n-const l11 = 11;\n-const l12 = 12;\n-const l13 = 13;\n-const l14 = 14;\n const l15 = 15;\n`;
    const prompt = applyPatchGate(filesFor(wrap(`*** Update File: ${file}\n${chunk}${chunk}`)), cwd);
    expect(prompt).not.toBeNull();
    expect(prompt?.reason).toContain("205 lines");
  });
});

test("overlapping old sides (one nested in another) fail closed", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "big.ts");
    writeFileSync(file, fixture(205));
    const outer = `@@\n const l10 = 10;\n-const l11 = 11;\n-const l12 = 12;\n-const l13 = 13;\n const l14 = 14;\n`;
    const inner = `@@\n-const l12 = 12;\n-const l13 = 13;\n`;
    const prompt = applyPatchGate(filesFor(wrap(`*** Update File: ${file}\n${outer}${inner}`)), cwd);
    expect(prompt).not.toBeNull();
    expect(prompt?.reason).toContain("205 lines");
  });
});

test("parser keeps ONE entry per file with the merged new side as `content` (main's shape) and sizes hunks from buffers", () => {
  const files = parseApplyPatch(wrap("*** Update File: a.ts\n@@\n ctx1\n-old1\n+new1\n+\n@@\n ctx2\n+new2\n"));
  expect(files).toHaveLength(1);
  const f = files[0]!;
  expect(f.op).toBe("update");
  expect(f.path).toBe("a.ts");
  expect(f.content).toBe("ctx1\nnew1\n\nctx2\nnew2");
  expect(f.hunks).toEqual([
    { oldString: "ctx1\nold1", newString: "ctx1\nnew1\n" },
    { oldString: "ctx2", newString: "ctx2\nnew2" },
  ]);
  const add = parseApplyPatch(wrap("*** Add File: b.ts\n+x\n+y\n"))[0]!;
  expect(add).toEqual({ path: "b.ts", content: "x\ny", op: "add" });
});

test("relative path (the only form Codex emits) is judged post-patch when process cwd is the project root", () => {
  withMax200(() => {
    const cwd = root();
    writeFileSync(join(cwd, "big.ts"), fixture(205));
    const prev = process.cwd();
    process.chdir(cwd);
    try {
      const shrink = wrap("*** Update File: big.ts\n@@\n const l0 = 0;\n-const l1 = 1;\n-const l2 = 2;\n-const l3 = 3;\n-const l4 = 4;\n-const l5 = 5;\n-const l6 = 6;\n const l7 = 7;\n");
      expect(applyPatchGate(filesFor(shrink), cwd)).toBeNull();
      const grow = wrap("*** Update File: big.ts\n@@\n const l0 = 0;\n+const extra = 1;\n");
      expect(applyPatchGate(filesFor(grow), cwd)?.reason).toContain("206 lines");
    } finally {
      process.chdir(prev);
    }
  });
});

test("codex deny names the project-relative path in the apply_patch remediation, not the basename", () => {
  withMax200(() => {
    const cwd = root();
    mkdirSync(join(cwd, "src", "policy"), { recursive: true });
    const file = join(cwd, "src", "policy", "big.ts");
    writeFileSync(file, fixture(205));
    const prompt = applyPatchGate(filesFor(wrap(`*** Update File: ${file}\n@@\n const l0 = 0;\n+const extra = 1;\n`)), cwd);
    expect(prompt?.reason).toContain("*** Update File: src/policy/big.ts)");
    expect(prompt?.reason).not.toContain("Use Write");
    expect(prompt?.reason).not.toContain("~/.claude");
  });
});

test("EOF off-by-one: a chunk that strips the file's final blank line never under-counts (195 + 6 -> 201 -> denied)", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "edge.ts");
    writeFileSync(file, fixture(195));
    const adds = Array.from({ length: 6 }, (_v, i) => `+const a${i} = ${i};`).join("\n");
    const patch = wrap(`*** Update File: ${file}\n@@\n const l10 = 10;\n${adds}\n@@\n const l194 = 194;\n-\n`);
    const prompt = applyPatchGate(filesFor(patch), cwd);
    expect(prompt).not.toBeNull();
    expect(prompt?.reason).toContain("201 lines");
  });
});

test("pure-add chunk (no context, no `-`) is appended at EOF and counted (195 + 20 -> denied)", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "grow.ts");
    writeFileSync(file, fixture(195));
    const adds = Array.from({ length: 20 }, (_v, i) => `+const g${i} = ${i};`).join("\n");
    const prompt = applyPatchGate(filesFor(wrap(`*** Update File: ${file}\n@@\n${adds}\n`)), cwd);
    expect(prompt).not.toBeNull();
    expect(prompt?.reason).toContain("215 lines");
  });
});

test("two `*** Update File:` blocks on the same path are judged cumulatively (195 + 3 + 3 -> denied)", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "twice.ts");
    writeFileSync(file, fixture(195));
    const block = (anchor: number, tag: string): string =>
      `*** Update File: ${file}\n@@\n const l${anchor} = ${anchor};\n+const ${tag}1 = 1;\n+const ${tag}2 = 2;\n+const ${tag}3 = 3;\n`;
    const prompt = applyPatchGate(filesFor(wrap(block(10, "x") + block(100, "y"))), cwd);
    expect(prompt).not.toBeNull();
    expect(prompt?.reason).toContain("201 lines");
  });
});

test("`*** Add File:` then `*** Update File:` on the same new path is judged on the added content (195 + 10 -> denied)", () => {
  withMax200(() => {
    const cwd = root();
    const rel = "fresh.ts";
    const addLines = Array.from({ length: 195 }, (_v, i) => `+const n${i} = ${i};`).join("\n");
    const more = Array.from({ length: 10 }, (_v, i) => `+const m${i} = ${i};`).join("\n");
    const patch = wrap(`*** Add File: ${rel}\n${addLines}\n*** Update File: ${rel}\n@@\n const n5 = 5;\n${more}\n`);
    const prompt = applyPatchGate(filesFor(patch), cwd);
    expect(prompt).not.toBeNull();
    expect(prompt?.reason).toContain("205 lines");
  });
});

test("old side matching only INSIDE a longer line is not a match (line-aligned lookup) -> fail-closed on 205", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "big.ts");
    writeFileSync(file, fixture(205));
    // "l1 = 1;" is a suffix of "const l1 = 1;", never a whole line: unaligned, so the shrink is not trusted.
    const prompt = applyPatchGate(filesFor(wrap(`*** Update File: ${file}\n@@\n-l1 = 1;\n-const l2 = 2;\n-const l3 = 3;\n-const l4 = 4;\n-const l5 = 5;\n-const l6 = 6;\n`)), cwd);
    expect(prompt).not.toBeNull();
    expect(prompt?.reason).toContain("205 lines");
  });
});

test("second `*** Update File:` block on an already-size-judged path still runs the DRY gate on its OWN content", () => {
  const cwd = root();
  const file = join(cwd, "small.ts");
  writeFileSync(file, "const l0 = 0;\nconst l1 = 1;\nconst l2 = 2;\nconst l3 = 3;\nconst l4 = 4;\n");
  // A duplicate declaration elsewhere in the same cwd — the DRY grep target.
  writeFileSync(join(cwd, "existing.ts"), "export function aVeryUniqueLongSymbolName() { return 0; }\n");
  const block1 = `*** Update File: ${file}\n@@\n const l0 = 0;\n+const extra = 1;\n`;
  // Only the SECOND block re-declares the symbol; size-judging happens once on
  // the first block (mergedHunksByPath already covers both), so without the
  // fix the loop `continue`s past `dryGate` for this second entry entirely.
  const block2 = `*** Update File: ${file}\n@@\n const l4 = 4;\n+export function aVeryUniqueLongSymbolName() { return 1; }\n`;
  const prompt = applyPatchGate(filesFor(wrap(block1 + block2)), cwd);
  expect(prompt).not.toBeNull();
  expect(prompt?.title).toBe("Possible duplicate code (DRY)");
  expect(prompt?.reason).toContain("aVeryUniqueLongSymbolName");
});

test("Claude deny message is pinned byte-for-byte (generic + react), unaffected by the codex branch", () => {
  expect(evaluateFileSize(205, 200, "/x/big.ts", "generic", 205).message).toBe(
    "BLOCKED: 'big.ts' has 205 lines (max: 200). TO SPLIT: 1) Read SOLID rules: ~/.claude/plugins/marketplaces/fusengine-plugins/plugins/generic/ 2) Create new module files (<190 lines each) 3) Use Write to replace 'big.ts' with <200 lines version.",
  );
  expect(evaluateFileSize(205, 200, "/x/App.tsx", "react", 205).message).toBe(
    "BLOCKED: 'App.tsx' has 205 lines (max: 200). TO SPLIT: 1) Read SOLID rules: ~/.claude/plugins/marketplaces/fusengine-plugins/plugins/react-expert/skills/solid-react/ 2) Create new module files (<190 lines each) 3) Use Write to replace 'App.tsx' with <200 lines version.",
  );
});
