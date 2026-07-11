import { describe, expect, test } from "bun:test";
import { evaluate } from "../src/policy/evaluate";

/** Build `n` distinct one-statement lines (each unique — safe old_string anchors). */
const lines = (n: number, tag = "l"): string => Array.from({ length: n }, (_, i) => `const ${tag}${i} = ${i};`).join("\n") + "\n";

const FILE = "src/feature/sample.ts";
const MAX = 100;

const edit = (existingContent: string, existingLines: number, oldString: string, newString: string, isReplaceAll = false) =>
  evaluate({ tool: "Edit", filePath: FILE, content: newString, oldString, isReplaceAll, existingContent, existingLines, maxLines: MAX });

describe("file-size gate — Edit outcome (fix/edit-file-size-outcome)", () => {
  test("invariant: Write over the limit stays denied", () => {
    const res = evaluate({ tool: "Write", filePath: FILE, content: lines(120), maxLines: MAX });
    expect(res.decision).toBe("deny");
  });

  test("invariant: Edit pushing a compliant file over the limit is denied", () => {
    const existing = lines(95);
    const res = edit(existing, 95, "const l10 = 10;", lines(12, "grow"));
    expect(res.decision).toBe("deny");
  });

  test("invariant: Edit growing an already-oversized file is denied", () => {
    const existing = lines(120);
    const res = edit(existing, 120, "const l10 = 10;", lines(5, "grow"));
    expect(res.decision).toBe("deny");
  });

  test("new: Edit shrinking an oversized file to compliance is allowed", () => {
    const removed = lines(30, "mid");
    const existing = lines(60) + removed + lines(30, "tail");
    const res = edit(existing, 120, removed, "// consolidated\n");
    expect(res.decision).toBe("allow");
  });

  test("new: Edit strictly shrinking an oversized file (still over limit) is allowed", () => {
    const removed = lines(20, "mid");
    const existing = lines(100) + removed + lines(30, "tail");
    const res = edit(existing, 150, removed, lines(10, "small"));
    expect(res.decision).toBe("allow");
  });

  test("replace_all: growth is scaled by occurrence count (no under-estimate)", () => {
    // 10 identical marker lines inside an 85-line file: replacing each 1-line
    // marker with 3 lines yields 85 + 2*10 = 105 > 100 — MUST deny. A times=1
    // under-estimate (87 lines) would wrongly allow.
    const marker = "const dup = 1;";
    const existing = lines(75) + Array.from({ length: 10 }, () => marker).join("\n") + "\n";
    const res = edit(existing, 85, marker, "const a = 1;\nconst b = 2;\nconst c = 3;", true);
    expect(res.decision).toBe("deny");
  });

  test("fail-closed: old_string not found keeps the on-disk deny", () => {
    const existing = lines(120);
    const res = edit(existing, 120, "THIS_STRING_IS_NOT_IN_THE_FILE", "// tiny\n");
    expect(res.decision).toBe("deny");
  });

  test("custom limit: outcome is judged against maxLines override", () => {
    const removed = lines(30, "mid");
    const existing = lines(30) + removed + lines(10, "tail");
    const res = evaluate({ tool: "Edit", filePath: FILE, content: "// gone\n", oldString: removed, isReplaceAll: false, existingContent: existing, existingLines: 70, maxLines: 50 });
    expect(res.decision).toBe("allow");
    const grow = evaluate({ tool: "Write", filePath: FILE, content: lines(60), maxLines: 50 });
    expect(grow.decision).toBe("deny");
  });
});
