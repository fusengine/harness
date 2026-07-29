/**
 * @module corpus-resolve-cache
 * Claude Code's per-plugin VERSIONED CACHE tree, split out of
 * `corpus-resolve.ts` to keep that file within the SOLID size budget (SRP).
 *
 * Claude Code caches every installed marketplace plugin at
 * `~/.claude/plugins/cache/<mkt>/<plugin>/<version>/` — a tree SEPARATE from
 * `~/.claude/plugins/marketplaces/<mkt>/plugins/<plugin>/` (the marketplace's
 * own checkout), one version dir per `plugin.json` version bump, orphaned
 * versions pruned ~14 days after being superseded (docs: "Plugin caching and
 * file resolution"). The design corpus can ship under EITHER tree, and under
 * a DIFFERENT plugin id in each: a machine observed 2026-07-29 has the corpus
 * at `cache/fusengine-plugins/fuse-design/2.2.3/...` while the marketplace
 * checkout is `marketplaces/fusengine-plugins/plugins/design-expert/...`.
 * Identification here is therefore STRUCTURAL, never by plugin name: a
 * candidate `<mkt>/<plugin>/<version>/` dir qualifies iff it itself contains
 * `CORPUS_SUFFIX` — matching a hardcoded name would silently miss a
 * renamed/relocated corpus (the exact defect this module fixes).
 * @packageDocumentation
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { maxSemver } from "../../util/semver";
import { CORPUS_SUFFIX, children } from "./corpus-fs";

/** Real (non-prerelease) semver dirs, same filter `probeCodex` uses. */
const SEMVER_RE = /^\d+\.\d+(\.\d+)?$/;

/**
 * Claude: `<home>/.claude/plugins/cache/<mkt>/<plugin>/<highest STABLE semver
 * containing refs-design>` ("" when no plugin under any marketplace cache
 * ships the corpus). Marketplaces and plugin ids are both walked — neither is
 * assumed — so a corpus shipped under any plugin name is found.
 */
export function probeClaudeCache(home: string): string {
  const cacheRoot = join(home, ".claude", "plugins", "cache");
  for (const mkt of children(cacheRoot)) {
    const mktDir = join(cacheRoot, mkt);
    for (const plugin of children(mktDir)) {
      const pluginDir = join(mktDir, plugin);
      const versions = children(pluginDir).filter(
        (v) => SEMVER_RE.test(v) && existsSync(join(pluginDir, v, CORPUS_SUFFIX)),
      );
      const latest = maxSemver(versions);
      if (latest) return join(pluginDir, latest);
    }
  }
  return "";
}
