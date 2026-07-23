import { dirname, resolve } from "node:path";
import { maskCommentsAndStrings } from "./conventions/strip";
import { nearestManifestDir, projectCaps, type Cap } from "./nearest-manifest";

/** File-derived signal: a definitive non-JS framework, or a JS-family hint. */
interface FileSignal {
  /** Definitive framework from extension/content (non-JS) — wins outright. */
  definitive?: string;
  /** JS-family hint needing project caps to confirm (react/nextjs/tanstack-start). */
  jsHint?: "react" | "nextjs" | "tanstack-start";
}

/** react markers in a plain .ts/.js file (avoids TS-generic false positives). */
const REACT_CONTENT = /from ['"]react['"]|\buse(State|Effect|Context|Ref|Memo|Callback|Reducer|LayoutEffect)\b|className=/;
/** next.js markers in content. */
const NEXT_CONTENT = /use client|use server|NextRequest|NextResponse|from ['"]next|getServerSideProps|getStaticProps/;
/** next.js route-file conventions. */
const NEXT_ROUTE = /(page|layout|loading|error|route|middleware)\.(ts|tsx|js|jsx)$/;
/** TanStack Start markers (file routes, server fns, start/router imports). */
const TANSTACK_CONTENT = /createFileRoute|createServerFn|from ['"]@tanstack\/react-(start|router)/;

/** Derive the raw signal an extension + content carry (no filesystem access). */
function fileSignal(filePath: string, content: string): FileSignal {
  if (/\.swift$/.test(filePath)) return { definitive: "swift" };
  if (/\.php$/.test(filePath)) return { definitive: "laravel" };
  if (/\.java$/.test(filePath)) return { definitive: "java" };
  if (/\.go$/.test(filePath)) return { definitive: "go" };
  if (/\.rb$/.test(filePath)) return { definitive: "ruby" };
  if (/\.rs$/.test(filePath)) return { definitive: "rust" };
  if (/\.css$/.test(filePath) || /@tailwind|@apply/.test(content)) return { definitive: "tailwind" };
  // JS branch: content signals ride MASKED content (a `// migrated from
  // createServerFn pattern` comment must not flip nextjs → tanstack-start).
  const masked = maskCommentsAndStrings(content, "c");
  const isTs = TANSTACK_CONTENT.test(masked);
  const isNext = !isTs && (NEXT_ROUTE.test(filePath) || NEXT_CONTENT.test(masked));
  if (/\.(tsx|jsx)$/.test(filePath)) return { jsHint: isTs ? "tanstack-start" : isNext ? "nextjs" : "react" };
  if (/\.(ts|js)$/.test(filePath)) {
    if (isTs) return { jsHint: "tanstack-start" };
    if (isNext) return { jsHint: "nextjs" };
    if (REACT_CONTENT.test(masked)) return { jsHint: "react" };
  }
  return {};
}

/** Reconcile the JS signal against the project's REAL capabilities. */
function reconcile(caps: Set<Cap>, hint: "react" | "nextjs" | "tanstack-start"): string {
  const nextCap = caps.has("nextjs");
  const reactCap = caps.has("react") || nextCap; // next always ships react at runtime
  if (hint === "tanstack-start") {
    return caps.has("tanstack-start") || caps.has("tanstack-router") ? "tanstack-start" : reactCap ? "react" : "generic";
  }
  if (hint === "nextjs") return nextCap ? "nextjs" : reactCap ? "react" : "generic";
  return reactCap ? "react" : "generic";
}

/**
 * Detect a file's framework as the intersection of the REAL project (its nearest
 * manifest's capabilities) and the file's own extension/content signal. A
 * backend `.ts` in a react project is `generic` (no react signal) — fixing the
 * old extension-only default that flagged every `.ts` as react. Fail-open: any
 * error yields `"generic"`, never throws. Return values stay within the label
 * union ("react" | "nextjs" | "tanstack-start" | "laravel" | "swift" |
 * "tailwind" | "java" | "go" | "ruby" | "rust" | "generic") — `tanstack-start`
 * added 2026-07 (owner spec: first-class framework, Next.js-equivalent).
 * @param filePath - Path of the file being written/edited.
 * @param content - Its (incoming) content, for JS content signals.
 * @param cwd - Root to resolve a relative `filePath` against (default cwd).
 * @returns A framework label from the union.
 */
export function detectFramework(filePath: string, content: string, cwd: string = process.cwd()): string {
  try {
    const sig = fileSignal(filePath, content);
    if (sig.definitive) return sig.definitive;
    if (!sig.jsHint) return "generic";
    const caps = projectCaps(nearestManifestDir(dirname(resolve(cwd, filePath))));
    return reconcile(caps, sig.jsHint);
  } catch {
    return "generic";
  }
}
