/**
 * @module inject-budget
 * Hard per-fragment ceiling for harness-PRODUCED context injections (lessons,
 * snapshot sections, APEX task context, cartographer/dev-context blocks) —
 * inspired by Codex's "ContextualUserFragment, no item > 10K tokens" pattern.
 * NEVER apply this to owner-authored content (CLAUDE.md/rules): that path is
 * a locked invariant (see the "owner invariant" tests in
 * test/dedup-inject.test.ts) and must always ship uncapped and in full.
 *
 * A real regression motivated this: MEMORY/LESSON.md's SessionStart injection
 * had grown to ~44k tokens with no per-fragment or total alarm, silently
 * bloating every SessionStart/SubagentStart turn.
 * @packageDocumentation
 */

/**
 * Hard cap per fragment, in characters. ~8000 chars ≈ 2000 tokens at the
 * conservative ~4 chars/token ratio for mixed FR/EN prose — the accepted
 * approximation absent a real tokenizer (cf. LangChain's `trim_messages`
 * fallback token_counter). Chosen because a SINGLE SessionStart already
 * stacks several harness fragments (lessons, snapshot, dev-context,
 * cartographer) on top of the uncapped CLAUDE.md block, and the known 11x
 * multi-plugin hook fan-out can multiply whatever ships — 2k tokens/fragment
 * keeps the harness-produced share bounded even under that fan-out, while
 * still leaving room for a few dozen useful lines of content.
 */
export const FRAGMENT_CHAR_CAP = 8000;

/**
 * Cap `text` at {@link FRAGMENT_CHAR_CAP} characters, cutting at the last
 * newline within budget so no line is chopped mid-sentence. Text at or under
 * the cap is returned byte-identical (no-op). Over the cap, a single English
 * truncation line is appended so the reader knows content was dropped and
 * that the SOURCE FILE itself is untouched (only this injected view is cut).
 * @param label - Short identifier of the fragment (e.g. "lessons", "Git").
 * @param text - The candidate fragment body.
 * @returns `text` unchanged, or a truncated copy ending in the cut notice — always ≤ the cap.
 */
export function capFragment(label: string, text: string): string {
  if (text.length <= FRAGMENT_CHAR_CAP) return text;
  const totalLen = text.length;
  // Bound the label so a pathological (very long) label can never, by itself,
  // push the suffix — and thus the output — past the cap. Real labels are short
  // internal constants, so this is byte-identical for every actual caller.
  const safeLabel = label.length <= 80 ? label : `${label.slice(0, 77)}...`;
  const suffixFor = (keptLen: number): string =>
    `\n[truncated ${safeLabel}: kept ${keptLen} of ${totalLen} chars — source file unchanged]`;
  // Reserve worst-case suffix size using totalLen's digit count: kept length
  // can only be <= totalLen, so its digit count never exceeds this reserve.
  const reserve = suffixFor(totalLen).length;
  const budget = Math.max(0, FRAGMENT_CHAR_CAP - reserve);
  const slice = text.slice(0, budget);
  const lastNl = slice.lastIndexOf("\n");
  const kept = (lastNl > 0 ? slice.slice(0, lastNl) : slice).trimEnd();
  return kept + suffixFor(kept.length);
}

/** One named fragment's injected size, for {@link budgetReport}. */
export interface FragmentSize {
  label: string;
  chars: number;
}

/**
 * One-line numeric recap of what a batch of fragments actually injected —
 * the owner-requested visibility so a silent blowup (like the 44k-token
 * lessons block) shows up as a number instead of going unnoticed.
 * @param fragments - The injected fragments (post-cap sizes).
 * @returns e.g. `"injected 5 fragments, 14.2k chars"`, or `"injected 0 fragments"` when empty.
 */
export function budgetReport(fragments: FragmentSize[]): string {
  if (fragments.length === 0) return "injected 0 fragments";
  const total = fragments.reduce((sum, f) => sum + f.chars, 0);
  return `injected ${fragments.length} fragments, ${(total / 1000).toFixed(1)}k chars`;
}
