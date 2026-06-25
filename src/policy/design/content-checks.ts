/** Accessibility warnings: icon buttons need aria-label, images need alt. */
function checkAccessibility(content: string): string[] {
  const w: string[] = [];
  if (!/<(button|a|input|img)/.test(content)) return w;
  if (/<button[^>]*>/.test(content) && !/aria-label|aria-labelledby/.test(content) && /<button[^>]*>[^<]*<[^>]*Icon/.test(content)) {
    w.push("Accessibility: icon buttons need an aria-label.");
  }
  for (const m of content.matchAll(/<img[^>]*?>/g)) {
    if (!m[0].includes("alt=")) {
      w.push("Accessibility: images need an alt attribute.");
      break;
    }
  }
  return w;
}

/** Anti-pattern warnings: colored left borders, AI-slop gradients, emoji-as-icons. */
function checkPatterns(content: string): string[] {
  const w: string[] = [];
  if (/border-l-[0-9]+ border-l-(blue|green|red|purple)/.test(content)) w.push("Design: avoid colored left borders — use shadow/gradient.");
  if (/from-purple|to-purple|via-purple|from-pink.*to-purple/.test(content)) w.push("Design: avoid purple/pink gradients (AI slop) — use brand colors.");
  if (/>[^\x00-\x7F]+</.test(content)) w.push("Design: avoid emojis as icons — use a real icon set.");
  return w;
}

/** Forbidden-font warnings (CSS font-family + Google Fonts import). */
function checkFonts(content: string): string[] {
  const w: string[] = [];
  if (/font-family:\s*['"]?(Roboto|Inter|Arial|Open Sans|Lato)\b/i.test(content)) w.push("Font: forbidden family (Roboto/Inter/Arial/Open Sans/Lato) — use identity fonts.");
  if (/@import.*fonts\.googleapis.*family=(Roboto|Inter)\b/.test(content)) w.push("Font: Google Fonts import for a forbidden family.");
  return w;
}

/** Hard-coded-color warnings (hex in className or inline style). */
function checkColors(content: string): string[] {
  const w: string[] = [];
  if (/className="[^"]*#[0-9a-fA-F]{3,8}[^"]*"/.test(content)) w.push("Color: hard-coded hex in className — use CSS variables.");
  if (/(?:color|background(?:-color)?|fill|stroke):\s*['"]?#[0-9a-fA-F]{3,8}/.test(content)) w.push("Color: hard-coded hex in style — use var(--color-*).");
  return w;
}

/** Run all design content checks → non-blocking warnings (empty = clean). */
export function runDesignChecks(content: string): string[] {
  return [...checkAccessibility(content), ...checkPatterns(content), ...checkFonts(content), ...checkColors(content)];
}
