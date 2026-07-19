import type { CodexPrefixRule } from "../types";

/**
 * `chmod 777` `prompt`-decision variants — hand-mapped from `security.ts`'s
 * `DANGEROUS PATTERN: chmod 777` ASK_PATTERNS label. The source regex
 * accepts any chain of `-[a-zA-Z]+` flags before `777`; `prefix_rule` needs
 * one literal-token variant per common flag order, so every frequent
 * ordering is enumerated. Always `prompt`: `prefix_rule` cannot distinguish
 * an absolute-path target from a relative one, so both are prompted rather
 * than letting an absolute-path `chmod 777` fall through silently.
 */
export const CHMOD_ASK_RULES: CodexPrefixRule[] = [
  {
    sourceLabel: "DANGEROUS PATTERN: chmod 777",
    pattern: ["chmod", "777"],
    decision: "prompt",
    justification: "World-writable permissions; confirm the target is intended.",
    match: ["chmod 777 file.txt", "chmod 777 /tmp/file"],
    notMatch: ["chmod 755 file.txt"],
  },
  {
    sourceLabel: "DANGEROUS PATTERN: chmod 777",
    pattern: ["chmod", "-R", "777"],
    decision: "prompt",
    justification: "World-writable permissions, recursive; confirm the target is intended.",
    match: ["chmod -R 777 dir"],
    notMatch: ["chmod -R 755 dir"],
  },
  {
    sourceLabel: "DANGEROUS PATTERN: chmod 777",
    pattern: ["chmod", "-r", "777"],
    decision: "prompt",
    justification: "World-writable permissions, recursive (lowercase flag); confirm the target is intended.",
    match: ["chmod -r 777 dir"],
  },
  {
    sourceLabel: "DANGEROUS PATTERN: chmod 777",
    pattern: ["chmod", "-v", "777"],
    decision: "prompt",
    justification: "World-writable permissions, verbose flag; confirm the target is intended.",
    match: ["chmod -v 777 file.txt"],
  },
  {
    sourceLabel: "DANGEROUS PATTERN: chmod 777",
    pattern: ["chmod", "-Rv", "777"],
    decision: "prompt",
    justification: "World-writable permissions, combined recursive+verbose flags; confirm the target is intended.",
    match: ["chmod -Rv 777 dir"],
  },
  {
    sourceLabel: "DANGEROUS PATTERN: chmod 777",
    pattern: ["chmod", "-vR", "777"],
    decision: "prompt",
    justification: "World-writable permissions, combined verbose+recursive flags; confirm the target is intended.",
    match: ["chmod -vR 777 dir"],
  },
];
