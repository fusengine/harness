import { test, expect } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyPatchGate } from "../src/runtime/apply-patch-gate";
import { root, wrap, fixture, filesFor, withMax200 } from "./apply-patch-shrink-helpers";

/** Threshold-exact cases: the gate must be exact here, never one line strict (main allowed all three). */

test("pure deletion drops the line terminator too: 205 - 5 = 200 is ALLOWED (was over-counted to 201)", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "big.ts");
    writeFileSync(file, fixture(205));
    const del = Array.from({ length: 5 }, (_v, i) => `-const l${20 + i} = ${20 + i};`).join("\n");
    expect(applyPatchGate(filesFor(wrap(`*** Update File: ${file}\n@@\n${del}\n`)), cwd)).toBeNull();
  });
});

test("legit patch landing exactly on the limit is ALLOWED: 195 - 3 + 8 = 200", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "edge.ts");
    writeFileSync(file, fixture(195));
    const adds = Array.from({ length: 8 }, (_v, i) => `+const n${i} = ${i};`).join("\n");
    const patch = wrap(`*** Update File: ${file}\n@@\n-const l10 = 10;\n-const l11 = 11;\n-const l12 = 12;\n@@\n const l100 = 100;\n${adds}\n`);
    expect(applyPatchGate(filesFor(patch), cwd)).toBeNull();
  });
});

test("a lone blank context line after `@@` is a no-op, not an append: 200 stays 200 -> ALLOWED", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "full.ts");
    writeFileSync(file, fixture(200));
    expect(applyPatchGate(filesFor(wrap(`*** Update File: ${file}\n@@\n\n@@\n const l5 = 5;\n-const l6 = 6;\n+const l6 = 66;\n`)), cwd)).toBeNull();
  });
});

test("replacing a line by ONE BLANK line is not a deletion: 201 stays 201 -> DENIED (was under-counted to 200)", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "blank.ts");
    writeFileSync(file, fixture(201));
    const prompt = applyPatchGate(filesFor(wrap(`*** Update File: ${file}\n@@\n-const l10 = 10;\n+\n`)), cwd);
    expect(prompt).not.toBeNull();
    expect(prompt?.reason).toContain("201 lines");
  });
});

test("two back-to-back deletions sharing one blank-line boundary fail closed, not miscounted (202 stays 202 -> DENIED)", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "shared.ts");
    // Last line has NO trailing `\n`, so the 2nd chunk's old side ends at the
    // literal end of file and needs `dropBefore` — whose target `\n` is the
    // SAME character that terminates the 1st chunk's own old side.
    const content = `${fixture(200)}\nconst l200 = 200;`;
    writeFileSync(file, content);
    const patch = wrap(`*** Update File: ${file}\n@@\n-const l199 = 199;\n-\n@@\n-\n-const l200 = 200;\n`);
    const prompt = applyPatchGate(filesFor(patch), cwd);
    expect(prompt).not.toBeNull();
    expect(prompt?.reason).toContain("202 lines");
  });
});

test("witness: one line over the limit on a compliant file is still DENIED (195 - 3 + 9 = 201); a strict shrink on an oversized file stays allowed (205 - 4 = 201, existing policy)", () => {
  withMax200(() => {
    const cwd = root();
    const a = join(cwd, "a.ts");
    writeFileSync(a, fixture(205));
    const del4 = Array.from({ length: 4 }, (_v, i) => `-const l${20 + i} = ${20 + i};`).join("\n");
    expect(applyPatchGate(filesFor(wrap(`*** Update File: ${a}\n@@\n${del4}\n`)), cwd)).toBeNull();
    const b = join(cwd, "b.ts");
    writeFileSync(b, fixture(195));
    const adds9 = Array.from({ length: 9 }, (_v, i) => `+const n${i} = ${i};`).join("\n");
    const patch = wrap(`*** Update File: ${b}\n@@\n-const l10 = 10;\n-const l11 = 11;\n-const l12 = 12;\n@@\n const l100 = 100;\n${adds9}\n`);
    expect(applyPatchGate(filesFor(patch), cwd)?.reason).toContain("201 lines");
  });
});
