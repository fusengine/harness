/**
 * @module shell-read-refs
 * Codex teammates frequently read skill/SOLID reference `.md` files through a
 * shell Bash call (`cat`, `head`, …) instead of a native `Read` — the
 * refsRead/ref-journal freshness gates only ever credited a native `Read`
 * (`src/runtime/activity.ts`'s `READ_TOOLS` branch), so a shell-read skill
 * consultation was invisible to every SOLID/skill gate. This detects the
 * `.md` paths a KNOWN read-only command targets in a Bash `command`, for a
 * caller to fold into the SAME `{kind:"ref", path, ts}` activity
 * `src/runtime/record.ts` already persists (no new store, no new gate).
 *
 * Fail-open by construction: only a whitelisted read-only command name
 * credits its `.md` arguments — a non-read command (`echo`, `mv`, `tee`, …)
 * sharing a chained/piped segment is never credited, and `sed -i`/
 * `--in-place` (a MUTATION despite the `sed` name) is explicitly excluded.
 * @packageDocumentation
 */
import { commandToString } from "../runtime/command-string";

/** Read-only shell commands that can target a `.md` reference by path. */
const READ_COMMANDS = new Set(["cat", "head", "tail", "sed", "rg", "ripgrep", "less", "more", "bat"]);

/** POSIX shells whose `-c`-style argv (or inline string) wraps a real script. */
const SHELL_BINS = new Set(["bash", "sh", "zsh", "dash"]);

/** `sed -i` / `sed --in-place` mutates the file in place — never a read. */
const SED_INPLACE = /(^|\s)(-i\b|--in-place\b)/;

/** Split a command string on `&&`, `||`, `;`, `|`, and newlines — each side scanned independently. */
function segments(command: string): string[] {
  return command.split(/&&|\|\||[;|\n]/);
}

/** Strip a redirection (`>`, `>>`, `<`, `2>`, `&>`, …) and everything after — its target is WRITTEN, not read. */
function beforeRedirect(segment: string): string {
  const m = segment.match(/\s(?:\d*>{1,2}|<|&>)\s*\S/);
  return m ? segment.slice(0, m.index) : segment;
}

/** Naive shell tokenizer: whitespace-split, stripping one matching layer of quotes per token. */
function tokenize(segment: string): string[] {
  const tokens = segment.match(/(?:"[^"]*"|'[^']*'|\S+)/g) ?? [];
  return tokens.map((t) => (/^(['"]).*\1$/.test(t) ? t.slice(1, -1) : t));
}

/** Index of the first token that isn't an env-assignment prefix (`KEY=VAL cmd …`). */
function firstCommandIndex(tokens: string[]): number {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i] ?? "")) i++;
  return i;
}

/** The inner script of a `sh|bash|zsh|dash -c <script>` wrapper (as ONE token, since {@link tokenize} keeps a quoted phrase whole), or undefined when `tokens` isn't that shape. */
function unwrapShellC(tokens: string[]): string | undefined {
  const i = firstCommandIndex(tokens);
  const bin = tokens[i]?.slice(tokens[i].lastIndexOf("/") + 1);
  if (!bin || !SHELL_BINS.has(bin)) return undefined;
  const flag = tokens[i + 1];
  if (!flag || !/^-[a-z]*c$/.test(flag)) return undefined;
  return tokens[i + 2];
}

/** Credit the `.md` arguments of one segment if its command is a whitelisted read; recurses once into a `sh -c` wrapper. */
function scanSegment(raw: string, out: string[]): void {
  const segment = beforeRedirect(raw);
  const tokens = tokenize(segment);
  const inner = unwrapShellC(tokens);
  if (inner !== undefined) {
    for (const s of segments(inner)) scanSegment(s, out);
    return;
  }
  const i = firstCommandIndex(tokens);
  const name = tokens[i]?.slice(tokens[i].lastIndexOf("/") + 1);
  if (!name || !READ_COMMANDS.has(name)) return;
  if (name === "sed" && SED_INPLACE.test(segment)) return;
  for (const t of tokens.slice(i + 1)) {
    if (t.endsWith(".md") && !t.startsWith("-")) out.push(t);
  }
}

/**
 * The `.md` paths a read-only shell command reads in `command` (a Bash
 * `tool_input.command` — plain string or Codex's argv-array form, both
 * normalized via {@link commandToString}). Empty for a non-read command,
 * `sed -i` in-place, or an unparseable/absent command — fail-open, never a
 * false credit.
 * @param command - Raw `tool_input.command` value (string | string[] | unknown).
 */
export function shellReadRefPaths(command: unknown): string[] {
  const str = commandToString(command);
  if (!str) return [];
  const out: string[] = [];
  for (const seg of segments(str)) scanSegment(seg, out);
  return out;
}
