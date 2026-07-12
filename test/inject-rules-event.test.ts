import { describe, test, expect, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { injectRules } from "../src/runtime/lifecycle/inject-rules";

/** Build a throwaway pluginRoot with one `rules/*.md` file; caller cleans it up. */
function pluginRootWithRules(): string {
  const dir = mkdtempSync(join(tmpdir(), "inject-rules-"));
  mkdirSync(join(dir, "rules"), { recursive: true });
  writeFileSync(join(dir, "rules", "00-a.md"), "RULES BODY");
  return dir;
}

describe("injectRules: hookEventName mirrors the firing event", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  test.each(["SessionStart", "UserPromptSubmit", "SubagentStart"])(
    "%s tags the output with its own event name",
    (event) => {
      const root = pluginRootWithRules();
      dirs.push(root);
      const parsed = JSON.parse(injectRules(root, event));
      expect(parsed.hookSpecificOutput.hookEventName).toBe(event);
      expect(parsed.hookSpecificOutput.additionalContext).toBe("RULES BODY");
    },
  );

  test("empty rules dir returns '' regardless of event", () => {
    const dir = mkdtempSync(join(tmpdir(), "inject-rules-empty-"));
    dirs.push(dir);
    expect(injectRules(dir, "UserPromptSubmit")).toBe("");
  });
});
