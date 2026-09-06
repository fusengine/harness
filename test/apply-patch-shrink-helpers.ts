import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { normalizeEvent } from "../src/runtime/normalize";
import type { NormalizedFile } from "../src/runtime/normalize";

/** Fresh temp project root per test. */
export const root = (): string => mkdtempSync(join(tmpdir(), "fh-aps-"));

/** Wrap a patch body in the `*** Begin Patch` / `*** End Patch` envelope. */
export const wrap = (body: string): string => `*** Begin Patch\n${body}*** End Patch\n`;

/**
 * Build a fixture file with N literal `const lI = I;` lines (trailing newline).
 * @param n - Line count.
 */
export function fixture(n: number): string {
  return Array.from({ length: n }, (_v, i) => `const l${i} = ${i};`).join("\n") + "\n";
}

/**
 * Parse a raw apply_patch envelope through the real Codex normalize path.
 * @param patchText - Full envelope text.
 */
export function filesFor(patchText: string): NormalizedFile[] {
  const event = normalizeEvent("codex", { tool_name: "apply_patch", session_id: "s", tool_input: { command: patchText } });
  return event.files ?? [];
}

/**
 * Run `body` with FUSE_SOLID_MAX_LINES pinned to 200, then restore.
 * @param body - Test body.
 */
export function withMax200(body: () => void): void {
  const saved = process.env.FUSE_SOLID_MAX_LINES;
  process.env.FUSE_SOLID_MAX_LINES = "200";
  try {
    body();
  } finally {
    if (saved === undefined) delete process.env.FUSE_SOLID_MAX_LINES;
    else process.env.FUSE_SOLID_MAX_LINES = saved;
  }
}
