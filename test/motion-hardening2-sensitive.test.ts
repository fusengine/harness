import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { bannedListPath } from "../src/policy/motion/sensitive";
import { bash, isDeny, makeFixture, run } from "./motion-handle-fixture";
import { denied, runHost, write } from "./motion-hosts-fixture";

test("project contract edits and root removal are denied without blocking scaffolds", async () => {
  const fx = makeFixture();
  for (const tool of ["Write", "Edit"]) {
    expect(isDeny(await run(fx, { hook_event_name: "PreToolUse", session_id: "contract", tool_name: tool,
      tool_input: { file_path: ".motion/project.json", content: "{}", new_string: "{}" } }))).toBe(true);
  }
  for (const command of ["rm .motion/project.json", "rm -rf .motion", "mv .motion /tmp/review",
    "mv .motion/project.json /tmp/contract", "mv /tmp/contract .motion/project.json",
    "cp /tmp/contract .motion/project.json", "echo '{}' >.motion/project.json"]) {
    expect(isDeny(await run(fx, bash("contract", command)))).toBe(true);
  }
  for (const marker of ["Add File", "Update File", "Delete File"]) {
    expect(denied("codex", await runHost(fx, "codex", { hook_event_name: "PreToolUse", session_id: "contract", tool_name: "apply_patch",
      tool_input: { command: `*** Begin Patch\n*** ${marker}: .motion/project.json\n+{}\n*** End Patch` } }))).toBe(true);
  }
  expect(isDeny(await run(fx, bash("scaffold", "mkdir -p .motion/stills .motion/review")))).toBe(false);
  expect(isDeny(await run(fx, { hook_event_name: "PreToolUse", session_id: "scaffold", tool_name: "Write",
    tool_input: { file_path: ".motion/capture.js", content: "export const capture = true;" } }))).toBe(false);
});

test("Bash source redirects tee and heredocs are scanned", async () => {
  const fx = makeFixture();
  mkdirSync(dirname(bannedListPath(fx.home)), { recursive: true });
  writeFileSync(bannedListPath(fx.home), "ConfidentialName\n");
  for (const command of ["echo 'ConfidentialName 1299 EUR' >>src/a.ts", "printf 'ConfidentialName' | tee src/a.ts",
    "cat <<'EOF' >src/a.ts\nConfidentialName\nEOF", "echo '1299 EUR' >src/a.ts"]) {
    expect(isDeny(await run(fx, bash("source", command)))).toBe(true);
  }
  expect(isDeny(await run(fx, bash("safe", "echo 'hello' >>src/a.ts")))).toBe(false);
  expect(isDeny(await run(fx, bash("outside", "echo 'ConfidentialName 1299 EUR' >out/info.txt")))).toBe(false);
});

test("Cline SEARCH REPLACE scans replacement diff", async () => {
  const fx = makeFixture();
  const edit = async (diff: string): Promise<string> => runHost(fx, "cline", { hookName: "PreToolUse", taskId: "diff",
    preToolUse: { toolName: "replace_in_file", parameters: { path: join(fx.proj, "src/a.ts"), diff } } });
  for (const [search, replace] of [["<<<<<<< SEARCH", ">>>>>>> REPLACE"], ["------- SEARCH", "+++++++ REPLACE"]]) {
    expect(denied("cline", await edit(`${search}\nhello\n=======\n1299 EUR\n${replace}`))).toBe(true);
    expect(denied("cline", await edit(`${search}\n1299 EUR\n=======\nhello\n${replace}`))).toBe(false);
  }
  expect(denied("cline", await edit("<<<<<<< SEARCH\nhello\n=======\n1299 EUR"))).toBe(true);
});

test("oversized source writes never silently skip a sensitive tail", async () => {
  const fx = makeFixture();
  const content = `${"a".repeat(600 * 1024)} 1299 EUR`;
  expect(isDeny(await run(fx, { hook_event_name: "PreToolUse", session_id: "large", tool_name: "Write",
    tool_input: { file_path: "src/a.ts", content } }))).toBe(true);
  expect(denied("codex", await runHost(fx, "codex", write("codex", "large", "src/a.ts", content, fx.proj)))).toBe(true);
});

test("normalized Write content is not counted twice against the safety limit", async () => {
  const fx = makeFixture();
  expect(isDeny(await run(fx, { hook_event_name: "PreToolUse", session_id: "clean-large", tool_name: "Write",
    tool_input: { file_path: "src/a.ts", content: "a".repeat(300 * 1024) } }))).toBe(false);
});

test("source confinement resolves aliases without banning outside-source writes", async () => {
  const fx = makeFixture();
  mkdirSync(join(fx.base, "external"));
  symlinkSync(join(fx.base, "external"), join(fx.proj, "src", "external"));
  symlinkSync(join(fx.proj, "src"), join(fx.proj, "out", "source-alias"));
  for (const host of ["claude-code", "codex"] as const) {
    for (const path of ["src/a.ts", "out/source-alias/a.ts"]) {
      expect(denied(host, await runHost(fx, host, write(host, "alias", path, "1299 EUR", fx.proj)))).toBe(true);
    }
    for (const path of ["out/notes.txt", "src/external/notes.txt"]) {
      expect(denied(host, await runHost(fx, host, write(host, "outside", path, "1299 EUR", fx.proj)))).toBe(false);
    }
  }
});
