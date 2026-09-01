import { expect, test } from "bun:test";
import { closeSync, mkdtempSync, openSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { oversizeStdout, readCursorBounded } from "../src/cli/hook-io";

function oversizeResponse(payload: string): string {
  const file = join(mkdtempSync(join(tmpdir(), "cursor-depth-")), "payload.json");
  writeFileSync(file, payload);
  const fd = openSync(file, "r");
  try {
    const read = readCursorBounded(fd, 1024);
    expect(read.kind).toBe("oversize");
    return oversizeStdout("cursor", read.kind === "oversize" ? read.head : "");
  } finally {
    closeSync(fd);
  }
}

function deepPayload(depth: number, event: string, malformed = false): string {
  let value = "true";
  for (let index = 0; index < depth; index += 1) value = `{"value":${value}}`;
  const payload = `{"nested":${value},"pad":"${"x".repeat(2000)}","hook_event_name":"${event}"}`;
  return malformed ? payload.slice(0, -1) : payload;
}

test("oversized Cursor classifies valid JSON through depth 1000 and fails closed beyond its bound", () => {
  for (const depth of [256, 257, 1000]) {
    expect(oversizeResponse(deepPayload(depth, "afterFileEdit")), `observe:${depth}`).toBe("{}");
    expect(oversizeResponse(deepPayload(depth, "beforeTabFileRead")), `block:${depth}`).toBe('{"permission":"deny"}');
  }
  const malformed = JSON.parse(oversizeResponse(deepPayload(1000, "afterFileEdit", true)));
  expect(malformed.permission).toBe("deny");
  const aboveBound = JSON.parse(oversizeResponse(deepPayload(1024, "afterFileEdit")));
  expect(aboveBound.permission).toBe("deny");
});
