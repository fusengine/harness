/** @module motion/critic-filters — conservative linear filter graph sandbox. */
import { dirname, resolve } from "node:path";
import { existsSync, lstatSync } from "node:fs";
import { canonicalFilePath } from "../../runtime/prd/prd-canon";
import { isUnder } from "./paths";

const SAFE_FILTERS = new Set(["scale", "scale2ref", "fps", "select", "thumbnail", "crop", "pad", "format", "setsar", "setdar", "setpts", "asetpts", "trim", "atrim", "null", "anull", "split", "asplit", "hstack", "vstack", "overlay", "transpose", "hflip", "vflip", "subtitles", "ass", "color", "testsrc", "testsrc2", "sine", "anullsrc", "metadata", "ametadata", "psnr", "ssim"]);
const PATH_KEYS = new Set(["file", "stats_file", "f"]);

/** Confinement after rejecting expansion/protocols and canonicalizing symlinks. */
export function inside(path: string, cwd: string, reviewDir: string): boolean {
  if (path.startsWith("~") || path.includes("$")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) && !path.startsWith("file:")) return false;
  const absolute = resolve(cwd, path.replace(/^file:/, ""));
  // canonicalFilePath falls back to a parent for dangling links; never mistake that fallback for confinement.
  for (let candidate = absolute; ; candidate = dirname(candidate)) {
    try { if (lstatSync(candidate).isSymbolicLink() && !existsSync(candidate)) return false; } catch { /* A new regular output is expected. */ }
    if (dirname(candidate) === candidate) break;
  }
  return isUnder(canonicalFilePath(absolute), canonicalFilePath(reviewDir));
}

/** Validate every graph filter before inspecting supported file-writing options. */
export function filterViolation(filter: string, reviewDir: string, cwd: string): string | null {
  // Escapes and nested quoting alter ffmpeg delimiters; do not guess their meaning.
  if (/[\\'"]/.test(filter)) return "escaped or quoted filter graphs cannot be safely confined";
  for (const node of filter.split(/[,;]/)) {
    const body = node.replace(/^(?:\s*\[[^\]]*\])*\s*/, "");
    const name = /^[a-zA-Z0-9_]+/.exec(body)?.[0];
    if (!name || !SAFE_FILTERS.has(name)) return `ffmpeg filter ${name ?? "(unparsed)"} is not in the read-only whitelist`;
    if (/^(?:metadata|ametadata|psnr|ssim)$/.test(name)) {
      const options = body.slice(body.indexOf("=") + 1).split(":");
      const metadata = name === "metadata" || name === "ametadata";
      let named = false;
      for (let i = 0; i < options.length; i++) {
        const option = options[i] ?? "";
        const eq = option.indexOf("=");
        if (eq >= 0) named = true;
        const key = eq >= 0 ? option.slice(0, eq) : "";
        const positionalPath = !named && (metadata ? i === 5 : i < 2);
        if (!positionalPath && !PATH_KEYS.has(key)) continue;
        const path = (positionalPath ? option : option.slice(eq + 1)).replace(/\[[^\]]*\]$/g, "");
        if (path !== "-" && (!path || !inside(path, cwd, reviewDir))) return `ffmpeg filter file ${path || "(none)"} is outside the review dir`;
      }
    }
  }
  return null;
}
