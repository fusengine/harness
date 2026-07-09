/**
 * Path shapes {@link discoverRefs}'s `skillParents` treats as legitimate skill
 * roots: standalone `.claude`/`.codex`/`.cursor`/`.agents` skill dirs, marketplace
 * and version-cache plugins installed UNDER one of those same config dirs, and
 * the system-rooted `/etc/codex/skills`. Kept as a pure path-shape regex (no
 * disk access, no home/cwd) so {@link skillRefKey} stays a cheap string test
 * callable from the synchronous `solidReadGate`. Every alternative uses only
 * bounded `[^/]+` groups — no nested quantifiers, so no ReDoS exposure.
 *
 * ANCHORING: the marketplace/cache branches require the `.claude`/`.codex`/
 * `.cursor`/`.agents` segment to IMMEDIATELY precede `plugins/…/skills/` —
 * a bare `/plugins/cache/<a>/<b>/<c>/skills/` floating anywhere (e.g. under an
 * attacker-writable `/tmp/plugins/cache/...`) is NOT enough. `/etc/codex/skills/`
 * is anchored at the string start (`^`), since that shape is a real absolute
 * system path, not a directory name that can legitimately appear mid-path.
 */
const RECOGNIZED_SKILL_ROOT_RE =
  /(^|\/)\.(claude|codex|cursor|agents)\/(skills\/|plugins\/(marketplaces\/[^/]+\/plugins\/[^/]+|cache\/[^/]+\/[^/]+\/[^/]+)\/skills\/)|^\/etc\/codex\/skills\//;

/**
 * Normalize a reference path to its `skills/<skill>/...` suffix — the part
 * that stays IDENTICAL between a marketplace-first path (what `discoverRefs`
 * returns, carried by `ctx.refs`/`routed.*.filePath`) and the same skill read
 * by a sub-agent/teammate through a different root: a version-cache path
 * (extra version segment, plugin dir name that can diverge from the
 * marketplace one, e.g. `solid` vs `fuse-solid`) or a standalone
 * `.codex`/`.cursor`/`.agents` skills dir.
 *
 * ANTI-FORGERY: returns `null` — never a usable key — unless `path` also
 * matches one of the recognized skill-root SHAPES above. A path like
 * `/tmp/skills/solid-generic/references/solid-principles.md` has the right
 * suffix but no recognized root, so it cannot credit a SOLID read by suffix
 * alone; only an exact byte-for-byte match (same as any unrelated file) would.
 * @param path - Absolute path to normalize (a `ctx.refs` entry or a `refsRead` entry).
 * @returns The `skills/...` suffix, or `null` when `path` isn't a recognized skill path.
 */
export function skillRefKey(path: string): string | null {
  if (!RECOGNIZED_SKILL_ROOT_RE.test(path)) return null;
  const i = path.lastIndexOf("skills/");
  return i === -1 ? null : path.slice(i);
}
