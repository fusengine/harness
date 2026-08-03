import { test, expect } from "bun:test";
import { promptText } from "../src/runtime/prompt-text";
import { handleHook } from "../src/runtime/handle";
import { loadTrack } from "../src/tracking/store";
import { trackFile, defaultStateDir } from "../src/runtime/paths";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";

const root = (): string => mkdtempSync(join(tmpdir(), "fh-pt-"));

test("promptText: string identity — same reference, no trim/normalize", () => {
  const s = "  Foo Bar  ";
  expect(promptText(s)).toBe(s);
});

test("promptText: Kimi content-block array joins .text with \\n", () => {
  const kimi = [{ type: "text", text: "Lance la commande shell: ls -la . Puis reponds OK." }];
  expect(promptText(kimi)).toBe("Lance la commande shell: ls -la . Puis reponds OK.");
});

test("promptText: multi-block array joins with \\n, one block per line", () => {
  expect(promptText([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("a\nb");
});

test("promptText: degraded inputs never throw, all yield \"\"", () => {
  expect(promptText(undefined)).toBe("");
  expect(promptText(null)).toBe("");
  expect(promptText([])).toBe("");
  expect(promptText([{ type: "image" }])).toBe("");
  expect(promptText([{ text: 123 }])).toBe("");
  expect(promptText(42)).toBe("");
  expect(promptText({})).toBe("");
});

test("handleHook: real Kimi UserPromptSubmit payload (captured 0.31.1 shape) reaches the brainstorm-intent branch, same as an equivalent Claude Code string prompt", async () => {
  const cwd = root();
  const sid = "session_e8c00a10-8587-4c47-a7f1-cc20a50caeda";
  const kimiPayload = {
    hook_event_name: "UserPromptSubmit",
    session_id: sid,
    cwd,
    // Real capture, verbatim (see mission fixture) — creation-intent wording
    // ("build") so recordBrainstormRequired flips a bit we can assert on.
    prompt: [{ type: "text", text: "build a new component, then reply OK." }],
    is_steer: false,
  };
  const out = await handleHook("kimi", kimiPayload, { now: 1000, cwd });
  expect(out.exit).toBe(0);

  // Before the fix, `typeof payload.prompt === "string"` was false for this
  // array shape -> userPrompt stayed undefined -> the whole branch (including
  // recordBrainstormRequired) was skipped -> brainstormRequired never set.
  const track = await loadTrack(trackFile(sid, defaultStateDir(cwd)));
  expect(track.brainstormRequired).toBe(true);
});
