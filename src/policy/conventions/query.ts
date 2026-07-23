/**
 * TanStack Query definition detection over MASKED content (React and Vue
 * variants share the call names; the family scoping is the gate's job, via
 * project deps). Canonical home: `src/query/` — one file per domain. Only
 * DEFINITIONS are gated; inline consumption of a hook defined in `query/`
 * stays allowed.
 */
import { maskCommentsAndStrings } from "./strip";
import { nearestManifestDir, projectCaps } from "../nearest-manifest";
import { dirname, resolve } from "node:path";

/** Import line of a TanStack Query package (raw scan: masking blanks the module string). */
const QUERY_IMPORT_RE = /^\s*import\s+[^;]*@tanstack\/[\w-]*query[\w-]*/m;

/** A TanStack Query definition call. */
const QUERY_CALL_RE = /\b(?:useQuery|useMutation|useInfiniteQuery|queryOptions)\s*(?:<[^()]*>)?\s*\(/;

/** Exported declaration (`export const|function`) — a defined query hook. */
const EXPORT_DECL_RE = /^\s*export\s+(?:const|function)\s+\w+/m;

/**
 * True when the file imports a TanStack Query package (raw scan, anchored to
 * real import lines so `// import …` comments cannot match).
 * @param content - Raw file content.
 */
export function importsTanstackQuery(content: string): boolean {
  return QUERY_IMPORT_RE.test(content);
}

/**
 * True when the file DEFINES an exported query/mutation hook (export +
 * query call, masked scan) — as opposed to merely consuming one inline.
 * @param content - Raw file content.
 */
export function declaresQueryHook(content: string): boolean {
  const masked = maskCommentsAndStrings(content, "c");
  return QUERY_CALL_RE.test(masked) && EXPORT_DECL_RE.test(masked);
}

/**
 * True when the nearest manifest of `filePath` declares a TanStack Query
 * dependency (`@tanstack/react-query` or `@tanstack/vue-query`) — the
 * cap gate of every query convention (owner: no cap, no query rule).
 * @param filePath - The file being judged (its nearest manifest wins).
 */
export function queryCapActive(filePath: string): boolean {
  const caps = projectCaps(nearestManifestDir(dirname(resolve(filePath))));
  return caps.has("tanstack-query") || caps.has("vue-query");
}
