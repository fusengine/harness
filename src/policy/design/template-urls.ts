/**
 * Template-platform detection for the phase-1 navigate gate
 * (design-inspiration.md §FORBIDDEN Navigation Targets). Two rules, because
 * neither alone matches the doctrine:
 *  - template SHOPS are banned outright, on the host (subdomains included);
 *  - the path rule (/templates, /themes) applies ONLY to real product
 *    platforms that also host a template catalog — never to the whole web,
 *    or sothebys.com/en/marketplace (register research) would be denied.
 * The host is normalized (lowercase, port, userinfo, trailing dot stripped).
 * HONEST SCOPE: this is a LEXICAL filter — it follows no redirect, is not and
 * will never be exhaustive, and it is NOT the taste gate: the source of taste
 * is the refs-design corpus. This list exists to catch the reflex, not to map
 * the template economy. Frozen by owner decision (C5): no host or pattern may
 * be added or removed without re-opening that decision.
 * Award galleries are deliberately absent: they pass, as outbound-link finders.
 */

/** Template shops: banned outright, any path (subdomains included). */
const TEMPLATE_HOSTS: readonly string[] = [
  "themeforest.net", "themes.shopify.com", "marketplace.atlassian.com",
  "templatemonster.com", "creativemarket.com", "ui8.net", "html5up.net",
  "colorlib.com", "bootstrapmade.com", "startbootstrap.com", "cruip.com",
  "uideck.com", "envato.com", "tailwindui.com",
];

/** Real-product platforms whose template CATALOGS are banned via the path rule. */
const PLATFORM_HOSTS: readonly string[] = [
  "framer.com", "webflow.com", "vercel.com", "astro.build", "squarespace.com", "wix.com",
];

/**
 * Template-catalog path segments — evaluated ONLY on PLATFORM_HOSTS, and
 * deliberately WITHOUT `/marketplace`: those platforms run real, non-template
 * marketplaces (vercel.com/marketplace is infra). Atlassian/Shopify template
 * stores are already covered by the full host ban above.
 */
const TEMPLATE_PATH_RE = /^\/(templates|themes)(\/|$)/i;

/** Host part of `url`, normalized: lowercase, no port, no userinfo, no trailing dot. */
function hostOf(url: string): string {
  return (/^https?:\/\/(?:[^@/?#]*@)?([^/:?#]+)/i.exec(url)?.[1] ?? "").replace(/\.$/, "").toLowerCase();
}

const under = (host: string, domain: string): boolean => host === domain || host.endsWith(`.${domain}`);

/** True when `url` points at a banned template source (host rule, then platform path rule). */
export function isTemplateUrl(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (TEMPLATE_HOSTS.some((d) => under(host, d))) return true;
  if (!PLATFORM_HOSTS.some((d) => under(host, d))) return false;
  const path = /^https?:\/\/(?:[^@/?#]*@)?[^/?#]*(\/[^?#]*)/i.exec(url)?.[1] ?? "/";
  return TEMPLATE_PATH_RE.test(path);
}
