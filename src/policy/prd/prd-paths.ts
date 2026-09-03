/**
 * Pure path builders and classifiers for the PRD file tree
 * (`<root>/<homeSeg>/apex/prd*`). No fs access — string/path compare only.
 */
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { PrdPathKind, PrdRouter } from "./interfaces/types";

const AGENT_REPORT_SUFFIX = "-prd.json";
const DOCS_SUFFIX = ".md";

function apexDir(root: string, homeSeg: string): string {
  return join(root, homeSeg, "apex");
}

/** Absolute path to the router (`<root>/<homeSeg>/apex/prd.json`). */
export function prdRouterPath(root: string, homeSeg: string): string {
  return join(apexDir(root, homeSeg), "prd.json");
}

/** Absolute path to the PRD directory (`<root>/<homeSeg>/apex/prd`). */
export function prdDir(root: string, homeSeg: string): string {
  return join(apexDir(root, homeSeg), "prd");
}

/** Absolute path to a task-PRD file, given the router entry's `prd` field. */
export function prdTaskPath(root: string, homeSeg: string, relPrd: string): string {
  return join(apexDir(root, homeSeg), relPrd);
}

/** Absolute path to an agent's own report file (`prd/agents/<agent>-prd.json`). */
export function prdAgentReportPath(root: string, homeSeg: string, agent: string): string {
  return join(prdDir(root, homeSeg), "agents", `${agent}${AGENT_REPORT_SUFFIX}`);
}

/** Absolute path to a task's free-form doc (`prd/docs/<task>.md`). */
export function prdDocsPath(root: string, homeSeg: string, task: string): string {
  return join(prdDir(root, homeSeg), "docs", `${task}${DOCS_SUFFIX}`);
}

function resolveAgainstRoot(filePath: string, root: string): string {
  return isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
}

/**
 * True when `filePath` (absolute or root-relative) resolves under
 * `<root>/<homeSeg>/apex/prd/`, or is exactly the router itself. Normalizes
 * via `path.resolve`/`relative`; a `..` that escapes the PRD dir is rejected.
 */
export function isPrdScopedPath(filePath: string, root: string, homeSeg: string): boolean {
  const abs = resolveAgainstRoot(filePath, root);
  if (abs === resolve(prdRouterPath(root, homeSeg))) return true;
  const rel = relative(resolve(prdDir(root, homeSeg)), abs);
  return rel !== "" && rel !== "." && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Classifies an in-scope PRD path into one of the 4 file kinds (router,
 * task, agentReport, docs), or `"other"` when it is textually under
 * `apex/prd/` but matches none of the router-declared task files. `null`
 * when the path is not in scope at all (see {@link isPrdScopedPath}).
 */
export function classifyPrdPath(
  filePath: string,
  root: string,
  homeSeg: string,
  router: PrdRouter | null,
): PrdPathKind | null {
  if (!isPrdScopedPath(filePath, root, homeSeg)) return null;
  const abs = resolveAgainstRoot(filePath, root);
  if (abs === resolve(prdRouterPath(root, homeSeg))) return { kind: "router" };

  const dir = resolve(prdDir(root, homeSeg));
  const parts = relative(dir, abs).split(sep);
  const [first, second] = parts;

  if (parts.length === 2 && first === "agents" && second?.endsWith(AGENT_REPORT_SUFFIX)) {
    return { kind: "agentReport", agent: second.slice(0, -AGENT_REPORT_SUFFIX.length) };
  }
  if (parts.length === 2 && first === "docs" && second?.endsWith(DOCS_SUFFIX)) {
    return { kind: "docs", task: second.slice(0, -DOCS_SUFFIX.length) };
  }
  if (router) {
    for (const [task, entry] of Object.entries(router)) {
      if (resolve(prdTaskPath(root, homeSeg, entry.prd)) === abs) return { kind: "task", task };
    }
  }
  return { kind: "other" };
}
