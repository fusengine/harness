import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { authorizeCodexAction, codexAction, submitCodexConfirmation } from "../src/runtime/confirm/codex-confirm";

test("confirmation consumption is cross-process atomic and sibling-idempotent", async () => {
  const home = mkdtempSync(join(tmpdir(), "fh-confirm-race-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "fh-confirm-race-cwd-"));
  const sid = `race-${crypto.randomUUID()}`;
  const action = codexAction("Bash", cwd, "git commit -m confirm-race", 1000);
  if (!action) throw new Error("expected canonical action");
  try {
    expect(authorizeCodexAction(sid, action, "tool-a", 1000, home)).toEqual({ allow: false, reason: "no-token" });
    submitCodexConfirmation(sid, `CONFIRM ${action.code}`, 1100, home);
    const moduleUrl = pathToFileURL(join(import.meta.dir, "../src/runtime/confirm/codex-confirm.ts")).href;
    const code = `import { authorizeCodexAction } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(authorizeCodexAction(${JSON.stringify(sid)}, ${JSON.stringify(action)}, "tool-a", 1200, ${JSON.stringify(home)})));`;
    const children = [
      Bun.spawn([process.execPath, "-e", code], { stdout: "pipe" }),
      Bun.spawn([process.execPath, "-e", code], { stdout: "pipe" }),
    ];
    const results = await Promise.all(children.map(async (child) => {
      const stdout = await new Response(child.stdout).text();
      expect(await child.exited).toBe(0);
      return JSON.parse(stdout.trim()) as { allow: boolean; reason?: string };
    }));
    expect(results).toEqual([{ allow: true }, { allow: true }]);
    expect(authorizeCodexAction(sid, action, "tool-b", 1300, home)).toEqual({ allow: false, reason: "already-consumed" });
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});
