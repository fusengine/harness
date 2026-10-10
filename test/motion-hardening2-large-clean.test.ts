import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { bannedListPath, findSensitive } from "../src/policy/motion/sensitive";
import { denied, makeFixture, runHost, shell, write } from "./motion-hosts-fixture";

const CLEAN = `export const data = "${"a".repeat(600 * 1024)}"; `;

test("large clean source writes and Codex patches remain authorized", async () => {
  expect(findSensitive(CLEAN, ["ConfidentialName"])).toBeNull();
  for (const host of ["claude-code", "codex"] as const) {
    const fx = makeFixture();
    await runHost(fx, host, shell(host, "large-clean", "ls", fx.proj));
    const out = await runHost(fx, host, write(host, "large-clean", "src/a.ts", CLEAN, fx.proj));
    expect(denied(host, out)).toBe(false);
    expect(out).toBe("");
  }
});

test("large source sensitive tails are denied with redacted hits, not a size refusal", async () => {
  for (const host of ["claude-code", "codex"] as const) {
    const fx = makeFixture();
    mkdirSync(dirname(bannedListPath(fx.home)), { recursive: true });
    writeFileSync(bannedListPath(fx.home), "ConfidentialName\n");
    for (const [tail, kind] of [["ConfidentialName", "banned term"], ["1299 EUR", "currency amount"]] as const) {
      const out = await runHost(fx, host, write(host, "large-sensitive", "src/a.ts", `${CLEAN}// ${tail}`, fx.proj));
      expect(denied(host, out)).toBe(true);
      expect(out).toContain(kind);
      expect(out).not.toContain(tail);
      expect(out).not.toContain("safety limit");
    }
  }
});

test("full scans preserve normalization and currency boundaries across the old cutoff", () => {
  const prefix = "a".repeat(512 * 1024 - 3);
  expect(findSensitive(`${prefix} cafe\u0301`, ["CAFÉ"])).toBe('banned term "C***"');
  expect(findSensitive(`${prefix} 1299 EUR`, [])).toBe('currency amount "1*******"');
  expect(findSensitive(`${CLEAN}x1299 EUR`, [])).toBeNull();
  expect(findSensitive(`${CLEAN}s.replace(/(x)/, "$1")`, [])).toBeNull();
});
