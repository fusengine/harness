/**
 * Indented Unicode tree from scanned plugin items — pure text in, markdown out
 * (no fs). Ports `build_tree.py`.
 */

/** A scanned `[type, name, desc]` plugin item (agent/skill/command/hooks). */
export type ScanRow = readonly [type: string, name: string, desc: string];

const SECTION_ORDER: readonly string[] = ["agent", "skill", "command"];

/**
 * Format grouped items with tree connectors and optional markdown links.
 * Skill sections link to `./skills/<name>/index.md`; other sections to
 * `./<folder>/<name>.md`; unlinked sections render the bare name.
 * @param prefix - The line prefix (indent + branch glyphs).
 * @param items - The `[name, desc]` pairs to render.
 * @param folder - The link folder ("" disables linking).
 * @param asDirs - Whether items link to a subdirectory `index.md`.
 * @returns The rendered lines.
 */
function printItems(prefix: string, items: ReadonlyArray<[string, string]>, folder: string, asDirs: boolean): string[] {
  return items.map(([name, desc], i) => {
    const connector = i === items.length - 1 ? "└──" : "├──";
    const safe = name.replace(/^\/+/, "");
    let label = name;
    if (folder && asDirs) label = `[${name}](./${folder}/${safe}/index.md)`;
    else if (folder) label = `[${name}](./${folder}/${safe}.md)`;
    const short = desc && desc !== "(no description)" ? ` — ${desc.slice(0, 80)}` : "";
    return `${prefix}${connector} ${label}${short}`;
  });
}

/**
 * Build an indented tree from scanned items. The `hooks` row renders as a single
 * trailing `└── hooks: …` line; agents/skills/commands render as folder sections.
 * @param items - The scanned `[type, name, desc]` rows.
 * @param linked - When true, leaf names become markdown links.
 * @returns The joined tree text.
 */
export function buildTree(items: ReadonlyArray<ScanRow>, linked: boolean = false): string {
  const groups: Record<string, [string, string][]> = {};
  let hooksLine = "";
  for (const [typ, name, desc] of items) {
    if (typ === "hooks") hooksLine = name;
    else (groups[typ] ??= []).push([name, desc]);
  }

  const sections = SECTION_ORDER.filter((s) => s in groups);
  if (hooksLine) sections.push("hooks");

  const lines: string[] = [];
  const total = sections.length;
  for (let idx = 0; idx < total; idx++) {
    const section = sections[idx] ?? "";
    if (section === "hooks") {
      lines.push(`└── hooks: ${hooksLine}`);
      continue;
    }
    const isLast = idx === total - 1;
    const folder = `${section}s`;
    const prefix = isLast ? "└──" : "├──";
    const subPrefix = isLast ? "    " : "│   ";
    lines.push(`${prefix} ${folder}/`);
    const linkFolder = linked ? folder : "";
    const isDirSection = section === "skill";
    lines.push(...printItems(subPrefix, groups[section] ?? [], linkFolder, linked && isDirSection));
  }
  return lines.join("\n");
}
