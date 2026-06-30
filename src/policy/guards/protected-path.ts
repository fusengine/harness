import type { Prompt } from "../../prompt/types";
import type { GuardContext } from "./context";

/**
 * Path fragments that mark a location as internal/generated state.
 *
 * Parity with safe_paths.py: `~/.claude/fusengine-cache` is a *writable* cache
 * the harness owns (lessons, MCP cache, per-type state) — only the
 * `fusengine-cache/sessions` subtree is protected, not the whole cache.
 */
export const PROTECTED_FRAGMENTS: readonly string[] = [
  ".claude/plugins/marketplaces",
  ".claude/plugins/cache",
  ".claude/logs/00-apex",
  ".claude/fusengine-cache/sessions",
  ".claude/apex/",
  ".harness/track",
  ".harness/memory/state",
];

/**
 * Matches a real `.git` directory segment (`/.git/`, `~/.git`, leading or
 * trailing `.git`) without matching unrelated names like `foo.git/` or
 * `.github/`. Kept separate from the substring fragments for precise scoping.
 */
export const PROTECTED_GIT_RE: RegExp = /(?:^|[/~\s])\.git(?:\/|$)/;

/** Standard block response for any protected-path violation. */
const BLOCK: Prompt = {
  kind: "block",
  title: "Protected path",
  reason: "This is internal/generated enforcement state — do not edit it directly.",
  actions: ["Edit the source, not the generated/cache/state copy"],
};

/** Returns true if `str` references a protected fragment or a real `.git` segment. */
function containsProtected(str: string): boolean {
  return PROTECTED_FRAGMENTS.some((f: string): boolean => str.includes(f)) || PROTECTED_GIT_RE.test(str);
}

/** Strips surrounding quotes from a captured shell token. */
function unquote(t: string): string {
  return t.replace(/^['"]|['"]$/g, "");
}

/**
 * Extracts the genuine write *targets* of a shell command, so a protected path
 * appearing only as a *read source* (e.g. `grep x .claude/apex/ > out.txt`,
 * `cat .git/config > /dev/null`) is not mistaken for a write.
 *
 * Covers `>` / `>>` redirects (skipping `2>`, `&>`, `1>` fd-redirects and
 * `/dev/null`), `tee`, `dd of=`, and the destination / in-place file of
 * `cp` / `mv` / `sed -i` / `perl -i` (last path token of the segment).
 * Best-effort: obfuscated shell (base64, indirection, process substitution)
 * can still evade this — residual risk, mitigated by the freshness gate.
 */
function extractWriteTargets(cmd: string): string[] {
  const out: string[] = [];
  const push = (t: string | undefined): void => {
    const v: string = unquote((t ?? "").trim());
    if (v && v !== "/dev/null") out.push(v);
  };
  for (const m of cmd.matchAll(/(?<![2&\d])>{1,2}\s*('[^']+'|"[^"]+"|\S+)/g)) push(m[1]);
  for (const m of cmd.matchAll(/\btee\b(?:\s+-\S+)*\s+('[^']+'|"[^"]+"|\S+)/g)) push(m[1]);
  for (const m of cmd.matchAll(/\bdd\b[^|;&]*\bof=('[^']+'|"[^"]+"|\S+)/g)) push(m[1]);
  for (const seg of cmd.split(/[;&|]+/)) {
    if (!/\b(?:cp|mv)\b|\b(?:sed|perl)\b[^|;&]*\s-i/.test(seg)) continue;
    const head: string = seg.split(/[<>]/)[0] ?? "";
    const toks: string[] = head.trim().split(/\s+/).filter((t: string): boolean => Boolean(t) && !t.startsWith("-"));
    push(toks[toks.length - 1]);
  }
  return out;
}

/**
 * Blocks direct edits to internal/generated state directories.
 *
 * Covers:
 *  - Write / Edit tool calls whose `filePath` targets a protected fragment.
 *  - Bash commands whose actual write *target* is a protected fragment
 *    (read sources are ignored; see `extractWriteTargets`).
 *
 * @param ctx - The guard context (tool, filePath, command).
 * @returns A blocking {@link Prompt}, or null to allow.
 */
export function protectedPathGuard(ctx: GuardContext): Prompt | null {
  if ((ctx.tool === "Write" || ctx.tool === "Edit") && ctx.filePath) {
    if (containsProtected(ctx.filePath)) return BLOCK;
  }
  if (ctx.tool === "Bash" && ctx.command) {
    if (extractWriteTargets(ctx.command).some(containsProtected)) return BLOCK;
  }
  return null;
}
