import type { CodexPrefixRule } from "./types";
import { RM_VARIANT_RULES } from "./rules/rm-variants";
import { MKFS_RULES } from "./rules/mkfs";
import { DISKUTIL_RULES } from "./rules/diskutil";
import { DD_RULES } from "./rules/dd";
import { SINGLE_COMMAND_RULES } from "./rules/single-commands";
import { PRIVILEGE_RULES } from "./rules/privilege";
import { ASK_RULES as BASE_ASK_RULES } from "./rules/ask";
import { CHMOD_ASK_RULES } from "./rules/chmod-ask";
import { REMOTE_FETCH_RULES } from "./rules/remote-fetch";
import { withAbsolutePathAliases } from "./rules/absolute-paths";
import { SKIP_LIST } from "./skip-list";

/** Every `decision = "forbidden"` rule, hand-mapped from CRITICAL_PATTERNS. */
const CRITICAL_BASE: CodexPrefixRule[] = [
  ...RM_VARIANT_RULES,
  ...MKFS_RULES,
  ...DISKUTIL_RULES,
  ...SINGLE_COMMAND_RULES,
  ...PRIVILEGE_RULES,
];

/** Every `decision = "prompt"` rule, hand-mapped from ASK_PATTERNS (+ dd, downgraded). */
const ASK_BASE: CodexPrefixRule[] = [...BASE_ASK_RULES, ...CHMOD_ASK_RULES, ...DD_RULES, ...REMOTE_FETCH_RULES];

/** Absolute-path mirrors of the bare-name rules above (see `rules/absolute-paths.ts`). */
const ABSOLUTE_ALIASES: CodexPrefixRule[] = withAbsolutePathAliases([...CRITICAL_BASE, ...ASK_BASE]);

export const CRITICAL_RULES: CodexPrefixRule[] = [
  ...CRITICAL_BASE,
  ...ABSOLUTE_ALIASES.filter((r) => r.decision === "forbidden"),
];

export const ASK_RULES: CodexPrefixRule[] = [
  ...ASK_BASE,
  ...ABSOLUTE_ALIASES.filter((r) => r.decision === "prompt"),
];

export { SKIP_LIST };

/** Every generated `prefix_rule`, critical (`forbidden`) + ask (`prompt`). */
export const ALL_RULES: CodexPrefixRule[] = [...CRITICAL_RULES, ...ASK_RULES];
