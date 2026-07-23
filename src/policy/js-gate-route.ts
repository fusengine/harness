import { dirname, resolve } from "node:path";
import { nearestManifestDir, projectCaps, type Cap } from "./nearest-manifest";

/**
 * JS framework the SOLID gate routes on, resolved MANIFEST-FIRST (H1), or
 * `null` when the project declares no JS-framework capability — the caller
 * then falls back to the legacy content-marker routing, byte-identical.
 */
export type JsGateRoute = "nextjs" | "react" | null;

/**
 * Per-process memo of manifest-dir → capabilities. Hook invocations are
 * short-lived processes, so a stale manifest is impossible in production; the
 * memo only saves a re-read when one process judges several files (tests).
 */
const capsCache = new Map<string, Set<Cap>>();

/** Resolve the nearest manifest's capabilities for `filePath` (memoized per dir). */
function capsFor(filePath: string, cwd: string): Set<Cap> {
  const dir = nearestManifestDir(dirname(resolve(cwd, filePath)));
  if (!dir) return new Set();
  const hit = capsCache.get(dir);
  if (hit) return hit;
  const caps = projectCaps(dir);
  capsCache.set(dir, caps);
  return caps;
}

/**
 * Pick the JS gate from the PROJECT's declared framework, not the file's
 * content markers (H1): a bare client component (hooks but no `next` marker)
 * in a Next.js app must still hit nextGate's `'use client'` rule — content
 * routing sent it to reactGate and the file landed, crashing at runtime.
 * `nextjs` wins over `react` (every Next app ships react); a TanStack
 * Start/Router or plain-react project routes to reactGate. Fail-open: any
 * error, or no JS-framework capability (no manifest, backend, vue), yields
 * `null` so the legacy NEXT_RE content routing applies, byte-identical.
 * @param filePath - Path of the file being written/edited.
 * @param cwd - Root to resolve a relative `filePath` against (default cwd).
 * @returns The gate route, or null for the legacy content-based fallback.
 */
export function jsGateRoute(filePath: string, cwd: string = process.cwd()): JsGateRoute {
  try {
    const caps = capsFor(filePath, cwd);
    if (caps.has("nextjs")) return "nextjs";
    if (caps.has("react") || caps.has("tanstack-start") || caps.has("tanstack-router")) return "react";
    return null;
  } catch {
    return null;
  }
}
