/**
 * @module test/multi-state
 * Snapshot + diff of the on-disk state a set of hook processes left behind
 * (isolated HOME and project cwd), normalised so two runs that differ only by
 * clock, sandbox path or random signature compare equal.
 */
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { Sandbox } from "./multi-spawn";

/** Normalise run-specific noise (paths, timestamps, ids, signatures). */
export function normalize(text: string, sb: Sandbox): string {
  return text
    .split(sb.home).join("<HOME>")
    .split(sb.cwd).join("<CWD>")
    .replace(/state\/[0-9a-f]{8}/g, "state/<PROJECT-HASH>")
    .replace(/"nonce":"[0-9a-f]+"/g, '"nonce":"<NONCE>"')
    .replace(/\b1[5-9]\d{11}\b/g, "<MS>")
    .replace(/\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?Z?/g, "<ISO>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<UUID>")
    .replace(/\b[0-9a-f]{32,}\b/g, "<HEX>")
    .replace(/(?:fh-rdv-)[A-Za-z0-9]+/g, "<TMP>");
}

/** Relative-path -> normalised content for every file under `root` (rdv dir excluded). */
function walk(root: string, sb: Sandbox, out: Map<string, string>): void {
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const rel = relative(root, path);
      // the rendezvous dir itself and bun's own transpiler cache (written under HOME) are not harness state
      if (rel.startsWith(join(".fuse-harness", "rdv")) || rel.startsWith(join("Library", "Caches")) || rel.startsWith(".bun")) continue;
      const st = lstatSync(path);
      if (st.isDirectory()) visit(path);
      else if (st.isFile()) {
        let body = "";
        try { body = readFileSync(path, "utf8"); } catch { body = "<unreadable>"; }
        out.set(normalize(rel, sb), normalize(body, sb));
      }
    }
  };
  visit(root);
}

/** Snapshot of the whole sandbox. Keys are `home:`/`cwd:`-prefixed relative paths. */
export function snapshot(sb: Sandbox): Map<string, string> {
  const home = new Map<string, string>();
  const cwd = new Map<string, string>();
  walk(sb.home, sb, home);
  walk(sb.cwd, sb, cwd);
  const out = new Map<string, string>();
  for (const [k, v] of home) out.set(`home:${k}`, v);
  for (const [k, v] of cwd) out.set(`cwd:${k}`, v);
  return out;
}

/** Order-insensitive line multiset of a (journal-like) file body. */
function lines(body: string): string {
  return body.split("\n").filter(Boolean).sort().join("\n");
}

/** First differing line of two bodies (with the line counts). */
function firstDiff(x: string, y: string): string {
  const xs = x.split("\n");
  const ys = y.split("\n");
  const i = xs.findIndex((l, n) => l !== ys[n]);
  const at = i === -1 ? Math.min(xs.length, ys.length) : i;
  return `lines A=${xs.length} B=${ys.length}; first diff at ${at}\n--- A: ${(xs[at] ?? "<none>").slice(0, 400)}\n--- B: ${(ys[at] ?? "<none>").slice(0, 400)}`;
}

/** Human-readable differences between two snapshots (empty = identical). */
export function diffSnapshots(a: Map<string, string>, b: Map<string, string>): string[] {
  const diffs: string[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k);
    const y = b.get(k);
    if (x === undefined) diffs.push(`only in B: ${k}`);
    else if (y === undefined) diffs.push(`only in A: ${k}`);
    else if (x !== y) diffs.push(lines(x) === lines(y) ? `same lines, other order: ${k}` : `content differs: ${k}\n${firstDiff(x, y)}`);
  }
  return diffs;
}
