import { ALL_RULES, SKIP_LIST } from "./mapping";
import { renderPrefixRules, sanitizeComment } from "./starlark";

const HEADER =
  '# Codex execpolicy rules — generated from @fusengine/harness src/policy/guards/security.ts\n' +
  "# DO NOT hand-edit: regenerate via `harness codex-rules`.\n" +
  "#\n" +
  "# security.ts is the source of truth for dangerous-command detection; every\n" +
  '# CRITICAL_PATTERNS label maps to decision = "forbidden", every ASK_PATTERNS\n' +
  '# label maps to decision = "prompt". Strictest decision wins across matches.\n' +
  "# The harness remains the AUTHORITATIVE enforcement layer — this file is a\n" +
  "# complementary defense layer on the Codex side, not a replacement.\n" +
  "#\n" +
  "# IRREDUCIBLE gaps (shell syntax, invisible to argv-prefix matching, no\n" +
  "# prefix_rule can express them) — compensated by sandbox_mode +\n" +
  "# approval_policy.granular.sandbox_approval, not by this file:\n" +
  "#   - fork bomb: `:(){ :|:& };:`\n" +
  "#   - redirect to a raw disk device: `> /dev/sda`\n" +
  "#   - write to /etc via redirection: `> /etc/...`\n" +
  "#\n" +
  "# ASSUMED over-width (intentionally broader than security.ts, chosen to\n" +
  "# avoid a silent gap rather than an exact-but-brittle translation):\n" +
  "#   - dd: prompts on every dd invocation; security.ts only fires on of=/dev/*\n" +
  "#   - rm: prompts even on paths security.ts exempts via a 'trash' substring\n" +
  "#   - rm/eval/unlink: prompts even on a bare token with no trailing argument;\n" +
  "#     security.ts requires a space (i.e. an argument) after the command\n" +
  "#   - chmod 777: prompts on relative paths too, not only absolute ones\n" +
  "#   - sudo (/usr/bin/sudo alias): forbids the absolute-path form too;\n" +
  "#     security.ts's word-boundary regex does not match a preceding '/'\n" +
  "#   - curl/wget: prompts on EVERY curl/wget invocation, not only when piped\n" +
  '#     into a shell; security.ts\'s "remote script piped to a shell" label\n' +
  "#     only fires on `curl|wget ... | sh`. A simple plain-word pipe IS split\n" +
  "#     by Codex into separate argv commands (a bare-shell rule would also\n" +
  "#     catch that case), but this rule additionally targets the download\n" +
  "#     half for compound chains and non-shell payload execution where\n" +
  "#     sh/bash never appears as argv[0] (curl -o x && chmod +x x && ./x,\n" +
  "#     curl ... | python3); it replaces a former bare sh/bash/zsh heuristic\n" +
  '#     that prompted on ~50% of Codex\'s own `bash -lc "..."` command\n' +
  "#     wrapping and rarely caught the actual download\n" +
  "#\n" +
  "# NOT covered (out of scope, not an over-width — a purely local pipe with no\n" +
  "# network fetch is invisible to this rule AND to security.ts, which only\n" +
  "# matches curl/wget as the left-hand side of the pipe):\n" +
  "#   - `cat file | sh`: local pipe, no curl/wget involved\n" +
  "#   - quoted-variable/redirection installer one-liners, e.g.\n" +
  '#     `curl -fsSL "$URL" | sh`: variable substitution disables Codex\'s\n' +
  "#     pipe-splitting, collapsing the whole invocation to a single\n" +
  "#     ['bash', '-lc', '<script>'] where curl is not argv[0] — this exact\n" +
  "#     form was covered by the removed bare sh/bash heuristic and is no\n" +
  "#     longer covered by any rule here\n" +
  "#\n" +
  "# The following labels have NO argv-prefix equivalent at all (shell syntax\n" +
  "# not visible to execpolicy's argv matching) and are intentionally NOT\n" +
  "# expressed as prefix_rule() below — covered instead by sandbox_mode/approval_policy:";

/** Render the full Codex execpolicy `.rules` Starlark file as a string. */
export function buildCodexRules(): string {
  const skipComment: string = SKIP_LIST.map(
    (s) => `#   - ${sanitizeComment(s.sourceLabel)}: ${sanitizeComment(s.reason)}`,
  ).join("\n");
  const body: string = renderPrefixRules(ALL_RULES);
  return `${HEADER}\n${skipComment}\n\n${body}\n`;
}
