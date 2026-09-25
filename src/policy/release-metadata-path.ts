/**
 * @module release-metadata-path
 * Release-metadata files a version bump touches: a plugin manifest, the
 * marketplace index, a changelog. They carry no framework API, so the
 * framework-routed consultation gates (doc research / skill read) never apply;
 * every other gate (protected paths, git, file size, SOLID, DRY, APEX) is unaffected.
 * @packageDocumentation
 */

/** Manifest basenames exempt only when their parent directory is exactly `.claude-plugin`. */
const PLUGIN_MANIFESTS: ReadonlySet<string> = new Set(["plugin.json", "marketplace.json"]);

/** Changelog basename exempt at any depth (case-sensitive, Keep a Changelog naming). */
const CHANGELOG = "CHANGELOG.md";

/**
 * True when `filePath` is one of the closed list of release-metadata files:
 * `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` or
 * `CHANGELOG.md`, at any depth. Separator-agnostic (`/` or `\`), case-sensitive,
 * matched on whole path segments — nothing else is exempt.
 * @param filePath - Write/Edit target, absolute or relative.
 * @returns Whether the doc-research / skill-read gates must skip this path.
 */
export function isReleaseMetadataPath(filePath: string): boolean {
  const segments = filePath.split(/[\\/]+/);
  const base = segments.at(-1) ?? "";
  if (base === CHANGELOG) return true;
  return segments.at(-2) === ".claude-plugin" && PLUGIN_MANIFESTS.has(base);
}
