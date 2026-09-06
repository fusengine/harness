import { test, expect } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyPatchGate } from "../src/runtime/apply-patch-gate";
import { root, wrap, fixture, filesFor, withMax200 } from "./apply-patch-shrink-helpers";

test("apply_patch update: 205 -> 199 lines is allowed", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "big.ts");
    writeFileSync(file, fixture(205));
    const patch = wrap(
      `*** Update File: ${file}\n@@\n const l0 = 0;\n-const l1 = 1;\n-const l2 = 2;\n-const l3 = 3;\n-const l4 = 4;\n-const l5 = 5;\n-const l6 = 6;\n const l7 = 7;\n`,
    );
    expect(applyPatchGate(filesFor(patch), cwd)).toBeNull();
  });
});

test("apply_patch update: 205 -> 204 lines is allowed (strict-shrink policy, still over max)", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "big.ts");
    writeFileSync(file, fixture(205));
    const patch = wrap(`*** Update File: ${file}\n@@\n const l0 = 0;\n-const l1 = 1;\n const l2 = 2;\n`);
    expect(applyPatchGate(filesFor(patch), cwd)).toBeNull();
  });
});

test("apply_patch update: 205 -> 206 lines is denied", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "big.ts");
    writeFileSync(file, fixture(205));
    const patch = wrap(`*** Update File: ${file}\n@@\n const l0 = 0;\n+const extra = 999;\n`);
    const prompt = applyPatchGate(filesFor(patch), cwd);
    expect(prompt).not.toBeNull();
    expect(prompt?.reason).toContain("206 lines");
    expect(prompt?.reason).toContain("max: 200");
  });
});

test("apply_patch update: 199 -> 201 lines is denied", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "small.ts");
    writeFileSync(file, fixture(199));
    const patch = wrap(`*** Update File: ${file}\n@@\n const l0 = 0;\n+const extra1 = 1001;\n+const extra2 = 1002;\n`);
    const prompt = applyPatchGate(filesFor(patch), cwd);
    expect(prompt).not.toBeNull();
    expect(prompt?.reason).toContain("201 lines");
  });
});

test("apply_patch update: hunk old side not matching the real 205-line file is denied (fail-closed)", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "big.ts");
    writeFileSync(file, fixture(205));
    const patch = wrap(`*** Update File: ${file}\n@@\n const l0 = 0;\n-const nope = 42;\n const l2 = 2;\n`);
    const prompt = applyPatchGate(filesFor(patch), cwd);
    expect(prompt).not.toBeNull();
    expect(prompt?.reason).toContain("205 lines");
  });
});

test("apply_patch update: multi-hunk envelope on the same file sums deltas (+5 then -20 -> net allowed)", () => {
  withMax200(() => {
    const cwd = root();
    const file = join(cwd, "big.ts");
    writeFileSync(file, fixture(205));
    const removed = Array.from({ length: 20 }, (_v, i) => `-const l${50 + i} = ${50 + i};`).join("\n");
    const patch = wrap(
      `*** Update File: ${file}\n` +
        `@@\n const l10 = 10;\n+const extraA1 = 1001;\n+const extraA2 = 1002;\n+const extraA3 = 1003;\n+const extraA4 = 1004;\n+const extraA5 = 1005;\n` +
        `@@\n const l49 = 49;\n${removed}\n const l70 = 70;\n`,
    );
    const files = filesFor(patch);
    // One entry per FILE (main's shape for every other consumer), two hunks inside it.
    expect(files.filter((f) => f.op === "update").length).toBe(1);
    expect(files[0]?.hunks?.length).toBe(2);
    // Net: 205 + 5 - 20 = 190 <= 200 -> allowed.
    expect(applyPatchGate(files, cwd)).toBeNull();
  });
});
