/**
 * JSONL transcript parsing helpers for the ai-pilot scope: project-root
 * detection from file paths, file-path extraction, Edit extraction, and the
 * assistant report extraction. Ported into the harness from the ai-pilot
 * plugin's `cache/project-detect.ts` + `cache/lesson-helpers.ts` (now removed).
 */
import { readdirSync } from "node:fs";
import { readText } from "../../../util/runtime-io";
import type { EditEntry } from "./types";

const ROOT_MARKERS = [".git", ".hg", "turbo.json", "nx.json", "lerna.json", "pnpm-workspace.yaml"];
const PKG_MARKERS = ["package.json", "composer.json", "Package.swift", "Cargo.toml", "go.mod", "pyproject.toml", "Gemfile", "pom.xml"];

/** Detect the project root by walking up from the first file path to a marker. */
export function projectRootFromPaths(filePaths: string[]): string | null {
  const firstPath = filePaths[0];
  if (!firstPath) return null;
  const lastSlash = firstPath.lastIndexOf("/");
  if (lastSlash <= 0) return null;
  let dir = firstPath.substring(0, lastSlash);
  let bestRoot: string | null = null;
  while (dir && dir !== "/" && dir.length > 1) {
    try {
      const entries = readdirSync(dir);
      if (ROOT_MARKERS.some((m) => entries.includes(m))) return dir;
      if (PKG_MARKERS.some((m) => entries.includes(m))) bestRoot = dir;
    } catch { break; }
    const parentSlash = dir.lastIndexOf("/");
    if (parentSlash <= 0) break;
    dir = dir.substring(0, parentSlash);
  }
  return bestRoot;
}

/** Extract absolute file paths from tool_use entries in a JSONL transcript, optionally restricted to `toolNames` (default: any tool). */
export async function transcriptFilePaths(transcriptPath: string, toolNames?: readonly string[]): Promise<string[]> {
  const text = readText(transcriptPath);
  const paths = new Set<string>();
  for (const line of text.split("\n").filter(Boolean)) {
    try {
      const content = (JSON.parse(line) as { message?: { content?: unknown } })?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type !== "tool_use") continue;
        if (toolNames && !toolNames.includes(block.name)) continue;
        const fp = block.input?.file_path ?? block.input?.path ?? "";
        if (typeof fp === "string" && fp.startsWith("/")) paths.add(fp);
      }
    } catch { /* skip malformed */ }
  }
  return [...paths];
}

/** Extract deduplicated Edit tool_use entries (keyed by basename) from a transcript. */
export async function transcriptEdits(transcriptPath: string): Promise<EditEntry[]> {
  const text = readText(transcriptPath);
  const edits: EditEntry[] = [];
  for (const line of text.split("\n").filter(Boolean)) {
    try {
      const content = (JSON.parse(line) as { message?: { content?: unknown } })?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type === "tool_use" && block.name === "Edit" && block.input?.file_path) {
          edits.push({ file: block.input.file_path, oldStr: block.input.old_string ?? "", newStr: block.input.new_string ?? "" });
        }
      }
    } catch { /* skip malformed */ }
  }
  const seen = new Map<string, EditEntry>();
  for (const e of edits) seen.set(e.file.split("/").pop() ?? e.file, e);
  return [...seen.values()];
}

/** Extract the last assistant text report (first 500 lines) from a transcript. */
export async function transcriptReport(transcriptPath: string): Promise<string> {
  const text = readText(transcriptPath);
  let lastReport = "";
  for (const line of text.split("\n").filter(Boolean)) {
    try {
      const entry = JSON.parse(line) as { message?: { role?: string; content?: { type?: string; text?: string }[] } };
      if (entry?.message?.role !== "assistant") continue;
      for (const block of entry.message.content ?? []) {
        if (block.type === "text" && block.text) lastReport = block.text;
      }
    } catch { /* skip malformed */ }
  }
  return lastReport.split("\n").slice(0, 500).join("\n");
}
