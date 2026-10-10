import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleHook } from "../src/runtime/handle";
import type { PluginScope } from "../src/runtime/lifecycle";

/** A throwaway motion project + injected OS home (never the real $HOME). */
export interface MotionFixture {
  base: string;
  home: string;
  proj: string;
  contact: string;
  draft: string;
}

/** Create a motion project with a contact sheet and a draft mp4 on disk. */
export function makeFixture(): MotionFixture {
  const base = mkdtempSync(join(tmpdir(), "fh-motion-"));
  const home = join(base, "home");
  const proj = join(base, "proj");
  mkdirSync(home, { recursive: true });
  mkdirSync(join(proj, ".motion", "stills"), { recursive: true });
  mkdirSync(join(proj, "out"), { recursive: true });
  mkdirSync(join(proj, "src"), { recursive: true });
  writeFileSync(join(proj, ".motion", "project.json"), JSON.stringify({ render: "render.sh", draft: "out/draft.mp4", masters: ["out/master.mp4"], sourceDir: "src" }));
  const contact = join(proj, ".motion", "stills", "contact.png");
  const draft = join(proj, "out", "draft.mp4");
  writeFileSync(contact, "contact-v1");
  writeFileSync(draft, "draft-v1");
  return { base, home, proj, contact, draft };
}

/** Run one hook through `handleHook` under the given scope; returns stdout. */
export async function run(fx: MotionFixture, payload: Record<string, unknown>, scope: PluginScope | null = "motion", cwd: string = fx.proj): Promise<string> {
  const out = await handleHook("claude-code", payload, { now: 1_000_000, cwd, home: fx.home, ...(scope ? { scope } : {}) });
  return out.stdout;
}

/** PreToolUse Bash payload. */
export const bash = (sid: string, command: string, extra: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ hook_event_name: "PreToolUse", session_id: sid, tool_name: "Bash", tool_use_id: `tu-${sid}`, tool_input: { command }, ...extra });

/** UserPromptSubmit payload. */
export const prompt = (sid: string, text: string, extra: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ hook_event_name: "UserPromptSubmit", session_id: sid, prompt: text, ...extra });

/** Extract the 4-hex approval code from a deny stdout. */
export function codeOf(stdout: string): string {
  const m = stdout.match(/MOTION-APPROVE (?:stills|draft) ([0-9a-f]{4})/);
  if (!m?.[1]) throw new Error(`no approval code in: ${stdout}`);
  return m[1];
}

/** True when stdout is a PreToolUse deny. */
export const isDeny = (stdout: string): boolean => stdout.includes('"permissionDecision":"deny"');
