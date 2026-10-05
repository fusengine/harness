/**
 * Differential: the bounded-memory sub-agent transcript readers must return
 * EXACTLY what the former whole-file `readText` + `split` + `JSON.parse`
 * implementations returned, on random transcripts with adversarial lines.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAgentToolUses } from "../src/runtime/lifecycle/agent-transcript";
import { transcriptEdits, transcriptFilePaths, transcriptReport } from "../src/runtime/lifecycle/aipilot/transcript";
import { oldEdits, oldFilePaths, oldReport, oldToolUses } from "./subagent-transcript-oracle";

let seed = 7;
const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const pick = <T>(xs: T[]): T => xs[rnd(xs.length)] as T;

function line(): string {
  const ts = pick([`"timestamp":"2026-10-02T10:0${rnd(10)}:00Z",`, `"timestamp":${1_700_000_000_000 + rnd(1e6)},`, "", `"timestamp":"bad",`]);
  const tool = pick(["Write", "Edit", "Read", "Bash", "WebSearch"]);
  const fp = pick(["/abs/a.ts", "/abs/dir/b.md", "rel/c.ts", "/x/é ü.ts"]);
  const block = `{"type":"tool_use","name":"${tool}","input":{"file_path":"${fp}","old_string":"o${rnd(9)}","new_string":"n${rnd(9)}"}}`;
  const text = `{"type":"text","text":"report ${rnd(99)}\\nline2"}`;
  switch (rnd(12)) {
    case 0: return "";
    case 1: return "   ";
    case 2: return "{not json";
    case 3: return "null";
    case 4: return `{${ts}"message":{"role":"assistant","content":[${text}]}}`;
    case 5: return `{${ts}"message":{"role":"\\u0061ssistant","content":[${text}]}}`;
    case 6: return `{${ts}"message":{"content":[{"type":"tool\\u005fuse","name":"${tool}","input":{"file_path":"${fp}"}}]}}`;
    case 7: return `{${ts}"message":{"role":"user","content":"plain"}}\r`;
    case 8: return `{${ts}"message":{"content":[${block},${text}]}}`;
    case 9: return `{${ts}"message":{"content":[null,${block}]}}`;
    case 10: return `{${ts}"message":{"role":"assistant","content":[${block},${text}]}}`;
    default: return `{${ts}"message":{"content":[${block}]}}`;
  }
}

describe("sub-agent transcript readers: old === new", () => {
  test("2000 random transcripts, all four readers", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sat-"));
    try {
      for (let i = 0; i < 2000; i++) {
        const lines = Array.from({ length: 1 + rnd(40) }, line);
        const body = lines.join("\n") + (rnd(2) ? "\n" : "");
        const p = join(dir, `t${i}.jsonl`);
        writeFileSync(p, body);
        const text = readFileSync(p, "utf8");
        expect(readAgentToolUses(p)).toEqual(oldToolUses(text));
        expect(await transcriptFilePaths(p)).toEqual(oldFilePaths(text));
        expect(await transcriptFilePaths(p, ["Write", "Edit"])).toEqual(oldFilePaths(text, ["Write", "Edit"]));
        expect(await transcriptEdits(p)).toEqual(oldEdits(text));
        expect(await transcriptReport(p)).toEqual(oldReport(text));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("unreadable path: readAgentToolUses -> null, aipilot readers throw (as before)", async () => {
    expect(readAgentToolUses("/nonexistent/x.jsonl")).toBeNull();
    expect(readAgentToolUses(undefined)).toBeNull();
    await expect(transcriptFilePaths("/nonexistent/x.jsonl")).rejects.toThrow();
  });
});
