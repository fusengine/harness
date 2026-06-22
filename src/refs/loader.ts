import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter";
import type { RefMeta } from "./types";

function pick(fm: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = fm[k];
    if (v) return v;
  }
  return "";
}

/** Build a {@link RefMeta} from parsed frontmatter, tolerant of kebab/camel keys. */
export function toRefMeta(fm: Record<string, string>, filePath: string): RefMeta {
  return {
    name: pick(fm, "name") || filePath,
    description: pick(fm, "description"),
    keywords: pick(fm, "keywords"),
    priority: pick(fm, "priority"),
    related: pick(fm, "related"),
    appliesTo: pick(fm, "appliesTo", "applies-to", "applies_to"),
    triggerOnEdit: pick(fm, "triggerOnEdit", "trigger-on-edit", "trigger_on_edit"),
    level: pick(fm, "level"),
    filePath,
  };
}

/**
 * Scan a directory recursively for `.md` reference files and parse each into a
 * {@link RefMeta}. The content is entirely the consumer's — point this at any
 * refs dir (`FUSE_HARNESS_REFS`). Returns an empty list when the dir is absent.
 */
export async function loadRefs(dir: string): Promise<RefMeta[]> {
  let entries: string[];
  try {
    entries = (await readdir(dir, { recursive: true })) as string[];
  } catch {
    return [];
  }
  const refs: RefMeta[] = [];
  for (const rel of entries) {
    if (!rel.endsWith(".md")) continue;
    const filePath = join(dir, rel);
    refs.push(toRefMeta(parseFrontmatter(await readFile(filePath, "utf8")), filePath));
  }
  return refs;
}
