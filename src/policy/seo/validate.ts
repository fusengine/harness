/**
 * SEO completeness checks — pure text in, missing-items out (no fs). Ports the
 * `validate()` of `seo/hooks/validate-seo.ts` using regex instead of cheerio so
 * the harness keeps zero runtime HTML-parser dependency (presence-only gate).
 */

/** Extensions the SEO hook validates (HTML-like rendered output). */
const HTML_LIKE = /\.(html|astro|tsx|vue|blade\.php)$/;

/** True when `path` is an HTML-like file the SEO hook should validate. */
export function isHtmlLike(path: string): boolean {
  return HTML_LIKE.test(path);
}

/** True when a `<tag …>…</tag>` carries non-empty inner text. */
function hasNonEmptyTag(html: string, tag: string): boolean {
  const m = new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "i").exec(html);
  return !!m && m[0].replace(/<[^>]*>/g, "").trim().length > 0;
}

/** True when a `<meta …>` whose `selAttr=selVal` has a non-empty `content`. */
function hasMetaContent(html: string, selAttr: string, selVal: string): boolean {
  const re = new RegExp(`<meta\\b[^>]*\\b${selAttr}\\s*=\\s*["']${selVal}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0] ?? "";
  const c = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
  return c.trim().length > 0;
}

/** True when a `<link rel="canonical">` carries a non-empty `href`. */
function hasCanonical(html: string): boolean {
  const tag = /<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/i.exec(html)?.[0] ?? "";
  return (/\bhref\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "").trim().length > 0;
}

/**
 * Report the SEO elements missing from HTML-like content (title, meta
 * description, OG title/description/image, canonical, JSON-LD schema).
 * @param html - The file content.
 * @returns The missing element labels (empty when complete).
 */
export function missingSeoElements(html: string): string[] {
  const missing: string[] = [];
  if (!hasNonEmptyTag(html, "title")) missing.push("<title>");
  if (!hasMetaContent(html, "name", "description")) missing.push("<meta name='description'>");
  if (!hasMetaContent(html, "property", "og:title")) missing.push("og:title");
  if (!hasMetaContent(html, "property", "og:description")) missing.push("og:description");
  if (!hasMetaContent(html, "property", "og:image")) missing.push("og:image");
  if (!hasCanonical(html)) missing.push("canonical");
  if (!/<script\b[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(html)) missing.push("JSON-LD schema");
  return missing;
}
