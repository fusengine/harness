/**
 * Per-framework code-pattern → required sub-skill data, ported verbatim from the
 * fusengine `*_skill_triggers.py` + `*_patterns.py`
 * (react/nextjs/laravel/swift) and the shared `shadcn_patterns.py`.
 *
 * Pattern groups live in `./skill-patterns/*`. Most frameworks match
 * case-insensitively (source `re.IGNORECASE`); `swift` matches case-SENSITIVELY
 * (source `re.search` without the flag) — see {@link CASE_SENSITIVE_FRAMEWORKS}.
 */
import { REACT_TRIGGERS } from "./skill-patterns/react";
import { NEXTJS_TRIGGERS } from "./skill-patterns/nextjs";
import { LARAVEL_TRIGGERS } from "./skill-patterns/laravel";
import { SWIFT_TRIGGERS } from "./skill-patterns/swift";

/**
 * Frameworks whose Python source omits `re.IGNORECASE`, so their regexes must
 * be compiled WITHOUT the `i` flag to stay faithful.
 */
export const CASE_SENSITIVE_FRAMEWORKS: ReadonlySet<string> = new Set(["swift"]);

/** Map of required sub-skill name → triggering code patterns, keyed by framework. */
export const SKILL_TRIGGERS: Readonly<
  Record<string, Readonly<Record<string, ReadonlyArray<string>>>>
> = {
  react: REACT_TRIGGERS,
  nextjs: NEXTJS_TRIGGERS,
  laravel: LARAVEL_TRIGGERS,
  swift: SWIFT_TRIGGERS,
};
