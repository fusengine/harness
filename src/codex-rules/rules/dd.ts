import type { CodexPrefixRule } from "../types";

/**
 * `dd` — hand-mapped from `security.ts`'s `CRITICAL: Detected dangerous
 * command 'dd if='` label (source regex only fires on `of=/dev/...`).
 * Owner decision: DOWNGRADE forbidden -> prompt. `prefix_rule` cannot
 * glob-match a `key=value` argv token against a raw-device path, so a
 * literal forbidden translation would silently block legitimate
 * `dd if=a.img of=b.img` usage — prompting on every `dd` invocation instead
 * never lets a raw-disk write through silently, without blocking safe use.
 */
export const DD_RULES: CodexPrefixRule[] = [
  {
    sourceLabel: "CRITICAL: Detected dangerous command 'dd if='",
    pattern: ["dd"],
    decision: "prompt",
    justification:
      "dd can overwrite a raw block device via of=/dev/...; prompts on every dd invocation " +
      "(broader than security.ts, which only fires on of=/dev/*) because execpolicy cannot " +
      "glob-match that argv token — owner decision: do not block legitimate dd usage.",
    match: ["dd if=/dev/zero of=/dev/sda", "dd if=a.img of=b.img"],
  },
];
