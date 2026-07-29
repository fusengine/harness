import { test, expect } from "bun:test";
import { MIN_SCREENSHOTS, MIN_SCREENSHOTS_NO_CORPUS, initDesignState, type DesignState } from "../src/policy/design/state";
import { browserNavigateGate } from "../src/policy/design/gates-pipeline";
import { validateDesignSystem } from "../src/policy/design/gates";

const nav = (): DesignState => ({ ...initDesignState("a", "full", false), currentPhase: 1, inspirationRead: true });

test("screenshot quotas: corpus-present set lowered, corpus-absent set = today's behavior", () => {
  expect(MIN_SCREENSHOTS).toEqual({ full: 2, page: 1, component: 1 });
  expect(MIN_SCREENSHOTS_NO_CORPUS).toEqual({ full: 4, page: 2, component: 1 });
});

test("navigate gate: template platform HOSTS and platform template CATALOGS denied in phase 1", () => {
  const denied = [
    "https://themeforest.net/item/x",
    "https://themes.shopify.com/",
    "https://marketplace.atlassian.com/",
    "https://templatemonster.com/x",
    "https://framer.com/templates",
    "https://webflow.com/templates",
    "https://wix.com/templates",
    "https://vercel.com/Templates",
    "HTTPS://VERCEL.COM/TEMPLATES",
  ];
  for (const url of denied) expect(browserNavigateGate(nav(), url)?.kind).toBe("block");
});

test("navigate gate: host normalization — port, case, trailing dot and userinfo do not escape", () => {
  const escapes = [
    "https://themeforest.net:443/x",
    "https://THEMEFOREST.NET/x",
    "https://themeforest.net./x",
    "https://user@themeforest.net/x",
  ];
  for (const url of escapes) expect(browserNavigateGate(nav(), url)?.kind).toBe("block");
});

test("navigate gate: real sector sites pass — published client domains and real marketplaces included", () => {
  const allowed = [
    "https://boulangerie-dupont.fr",
    "https://awwwards.com/websites/x",
    "https://godly.website",
    "https://bestwebsite.gallery",
    "https://www.sothebys.com/en/marketplace",
    "https://stripe.com/marketplace",
    "https://framer.com",
    "https://acme-wbs.framer.website/x",
    "https://startify-template.webflow.io",
    "https://vercel.com/marketplace",
  ];
  for (const url of allowed) expect(browserNavigateGate(nav(), url)).toBeNull();
});

test("navigate deny: doctrine marker present, old catalog pointer gone", () => {
  const reason = browserNavigateGate(nav(), "https://themeforest.net/item/x")?.reason ?? "";
  expect(reason).toMatch(/corpus|refs-design/i);
  expect(reason).not.toContain("design-inspiration-urls.md");
});

test("validateDesignSystem: a corpus citation satisfies the source requirement only when the corpus is delivered", () => {
  const ds = "## Design Reference\n- Corpus: umbrel/## 4. Colors, fora/## 2. Colors\n--a: oklch(0.62 0.19 250);";
  expect(validateDesignSystem(ds, true)).toEqual([]);
});

test("validateDesignSystem: a forged citation without URL is refused when the corpus is absent", () => {
  const forged = "## Design Reference\n- Corpus: totally-made-up/whatever\n--a: oklch(0.62 0.19 250);";
  expect(validateDesignSystem(forged, false).join()).toContain("reference");
});

test("validateDesignSystem: random prose without URL or corpus citation still fails", () => {
  const ds = "## Design Reference\nsome prose without any source\n--a: oklch(0.62 0.19 250);";
  expect(validateDesignSystem(ds).join()).toContain("reference");
});
