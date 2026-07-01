/**
 * shadcn/ui domain skill-trigger patterns, ported verbatim from
 * `shadcn_skill_triggers.py` (the standalone shadcn-expert plugin, distinct
 * from the `SHADCN` HTML-detection patterns in `./shadcn.ts` consumed by
 * react/nextjs). 5 sub-skills. Matched case-insensitively (source `re.IGNORECASE`).
 */

/** Map of shadcn/ui sub-skill name → triggering code patterns. */
export const SHADCN_TRIGGERS: Readonly<Record<string, ReadonlyArray<string>>> = {
  "shadcn-detection": [
    "components\\.json", "@radix-ui/", "@base-ui/",
    "data-\\[state=", "data-\\[disabled\\]",
  ],
  "shadcn-components": [
    "from\\s+['\"].*components/ui/",
    "<(Button|Input|Select|Dialog|Card|Table|Tabs|Badge)\\b",
    "(Popover|Tooltip|Sheet|Drawer|Command|Accordion)\\b",
  ],
  "shadcn-theming": [
    "--(primary|secondary|muted|accent|destructive|foreground):",
    "(cssVariables|themeConfig|globals\\.css)\\b",
    ":root\\s*\\{|\\.dark\\s*\\{",
  ],
  "shadcn-registries": [
    "mcp__shadcn__(search|view|get_add_command|list_items)",
    "bunx.*shadcn@latest\\s+add\\b",
    "(registries|@shadcn|@acme)\\b",
  ],
  "shadcn-migration": [
    "(@radix-ui.*@base-ui|@base-ui.*@radix-ui)",
    "(migrat|convert|switch).*(radix|base.?ui)",
  ],
};
