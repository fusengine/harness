import { test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bannedListPath, findSensitive, loadBannedTerms, redact } from "../src/policy/motion/sensitive";

const home = (): string => realpathSync(mkdtempSync(join(tmpdir(), "motion-sens-")));

test("banned.txt absent -> []", () => {
  expect(loadBannedTerms(home())).toEqual([]);
});

test("banned.txt: trimmed, blanks and # comments skipped, CRLF ok", () => {
  const h = home();
  mkdirSync(dirname(bannedListPath(h)), { recursive: true });
  writeFileSync(bannedListPath(h), "# c\r\n  Acme Corp  \r\n\r\nSecret\n");
  expect(loadBannedTerms(h)).toEqual(["Acme Corp", "Secret"]);
});

test("banned term is case-insensitive and NFC-normalized", () => {
  expect(findSensitive("we sign with ACME CORP today", ["Acme Corp"])).not.toBeNull();
  const decomposed = "café";
  expect(findSensitive(`visit ${decomposed}`, ["café"])).not.toBeNull();
  expect(findSensitive("visit CAFÉ", ["café"])).not.toBeNull();
  expect(findSensitive("nothing here", ["Acme Corp"])).toBeNull();
});

test("hit is redacted: the term never appears in clear", () => {
  const r = findSensitive("deal with Zanzibar Holdings", ["Zanzibar Holdings"]);
  expect(r).not.toBeNull();
  expect(r?.toLowerCase()).not.toContain("zanzibar");
  expect(r).not.toContain("Holdings");
  expect(redact("Secret")).toBe("S*****");
  expect(redact("ab")).toBe("**");
  expect(redact("x")).toBe("*");
  expect(redact("")).toBe("");
});

test("currency amounts are detected", () => {
  for (const s of ["12 €", "total 12 €", "1 299,50 EUR", "$1,299.00", "£ 40", "5 usd", "price: 3.50GBP", "12€"]) {
    expect(findSensitive(s, [])).not.toBeNull();
  }
});

test("versions, shell vars, plain numbers are not amounts", () => {
  for (const s of ["version 1.2.3", "echo $HOME", "const a = 1299", "fps 30, 1080 x 1920", "#3 of 12", "2026-10-08", "$USER $PATH"]) {
    expect(findSensitive(s, [])).toBeNull();
  }
});

test("`$1` back-reference in a replace call is not an amount (false positive fixed)", () => {
  expect(findSensitive('s.replace(/(x)/, "$1")', [])).toBeNull();
  expect(findSensitive('s.replaceAll(/(x)/g, "<$1>$2")', [])).toBeNull();
  expect(findSensitive("re.sub(r'(x)', r'\\1$1', s)", [])).toBeNull();
});

test("real amounts survive on lines that also hold a replace call", () => {
  expect(findSensitive('s.replace(/a/, "$1")\nconst price = "$5"', [])).not.toBeNull();
  expect(findSensitive('s.replace(/a/, "$1 and 40 €")', [])).not.toBeNull();
});

test("long digit/space runs do not blow up (ReDoS guard)", () => {
  const t = Date.now();
  findSensitive("1 ".repeat(250_000), []);
  findSensitive("1,".repeat(250_000), []);
  expect(Date.now() - t).toBeLessThan(1500);
});

test("only the head of huge content is scanned", () => {
  expect(findSensitive(`${"a".repeat(600 * 1024)} 12 €`, [])).toBe('currency amount "1***"');
});
