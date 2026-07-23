import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { captureBashReceipt } from "../src/runtime/receipt-capture";
import { freshReceiptFromFile } from "../src/tracking/receipts";

// Kimi sends `tool_output` as a truncated string (no exit code/channels):
// recording from it would forge a success receipt for possibly-failed runs.
const dir = (): string => mkdtempSync(join(tmpdir(), "fh-rcpt-cap-"));
const T = 1_000_000_000_000;
const WIN = 365 * 24 * 3600 * 1000;

test("captureBashReceipt: structured response records the receipt", async () => {
  const file = join(dir(), "track.json");
  const response = { exit_code: 0, stdout: " 8 pass\n 0 fail\n", stderr: "" };
  await captureBashReceipt(file, "Bash", "bun test", undefined, response, T);
  expect(freshReceiptFromFile(file, WIN, T + 1)?.kind).toBe("test");
});

test("captureBashReceipt: a string tool_output (kimi) records nothing", async () => {
  const file = join(dir(), "track.json");
  await captureBashReceipt(file, "Bash", "bun test", undefined, " 8 pass\n 0 fail\n", T);
  expect(freshReceiptFromFile(file, WIN, T + 1)).toBeNull();
});

test("captureBashReceipt: tool_result wins over response; non-Bash and missing command skip", async () => {
  const file = join(dir(), "track.json");
  await captureBashReceipt(file, "Write", "bun test", undefined, { exit_code: 0 }, T);
  await captureBashReceipt(file, "Bash", undefined, undefined, { exit_code: 0 }, T);
  await captureBashReceipt(file, "Bash", "bunx tsc --noEmit", { exit_code: 0, stdout: "", stderr: "" }, "ignored-string", T);
  const receipt = freshReceiptFromFile(file, WIN, T + 1);
  expect(receipt?.kind).toBe("tsc");
  expect(receipt?.exitCode).toBe(0);
});
