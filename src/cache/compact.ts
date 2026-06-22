import { createHash } from "node:crypto";

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#x27;": "'", "&#39;": "'", "&nbsp;": " ", "&apos;": "'",
};

const BOILERPLATE: RegExp[] = [
  /^.*cookie.*(accept|consent|banner).*$/gim,
  /^.*was this (helpful|page helpful|article helpful).*$/gim,
  /^.*©\s*\d{4}.*all rights reserved.*$/gim,
  /^\s*(home|about|contact|privacy|terms)\s*\|\s*.*$/gim,
  /^.*subscribe to (our )?newsletter.*$/gim,
  /^.*follow us on (twitter|facebook|linkedin).*$/gim,
];

const MAX_BYTES = 5 * 1024;

function decodeEntities(text: string): string {
  let out = text;
  for (const [ent, ch] of Object.entries(HTML_ENTITIES)) out = out.split(ent).join(ch);
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)));
  out = out.replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(parseInt(d, 10)));
  return out;
}

/** Strip HTML entities + boilerplate, normalize blank lines, truncate to ~5KB. */
export function compactMarkdown(content: string): string {
  let text = decodeEntities(content);
  for (const re of BOILERPLATE) text = text.replace(re, "");
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  const enc = new TextEncoder().encode(text);
  if (enc.length > MAX_BYTES) {
    const truncated = new TextDecoder().decode(enc.slice(0, MAX_BYTES));
    const remaining = text.slice(truncated.length).split("\n").length - 1;
    text = `${truncated}\n\n[... truncated, ${remaining} lines]`;
  }
  return text;
}

/** 8-char MD5 of `${toolName}::${query}`. */
export function queryHash(toolName: string, query: string): string {
  return createHash("md5").update(`${toolName}::${query}`).digest("hex").slice(0, 8);
}

/** Bag-of-words Jaccard similarity strictly greater than `threshold`. */
export function jaccardSimilar(a: string, b: string, threshold = 0.8): boolean {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return inter / union > threshold;
}
