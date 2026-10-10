/**
 * @module motion/critic
 * Sandbox for the `motion-critic` agent: it may look (Read of media / the
 * review pack, ffprobe/ffmpeg/ls/stat) and write ONLY inside the review dir.
 * ffmpeg is checked option by option because it writes files well beyond its
 * positional output (`-progress`, `-report`, `-f tee|segment|hls|dash`, ...).
 */
import { basename, extname } from "node:path";
import { motionRedirectTargets } from "./shell-targets";
import { filterViolation, inside } from "./critic-filters";
import { MOTION_WRITE_TOOLS } from "./constants";
import type { Prompt } from "../../prompt/types";
import { commandTokens, hasEnvPrefix, hasSubstitution, segmentVerb, shellSegments } from "./shell-verbs";

const MEDIA_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".tif", ".tiff", ".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"]);
const VERBS = new Set(["ffprobe", "ffmpeg", "ls", "stat"]);
/** Options that write a side file named by their value (allowed only inside the review dir). */
const PATH_OPTS = new Set(["progress", "vstats_file", "dump_attachment", "passlogfile", "sdp_file", "print_graphs_file", "segment_list", "hls_segment_filename", "filter_script", "filter_complex_script"]);
/** Options that write to the cwd with no path argument — always blocked. */
const CWD_WRITERS = new Set(["report", "vstats"]);
/** Muxers that fan out to several or indirect outputs. */
const BAD_MUXERS = new Set(["tee", "segment", "stream_segment", "ssegment", "hls", "dash", "hds", "smoothstreaming"]);
const FILTER_OPTS = new Set(["vf", "af", "filter", "filter_complex", "lavfi"]);
const PROBE_VALUES = new Set(["f", "v", "loglevel", "show_entries", "of", "print_format", "select_streams", "read_intervals", "probesize", "analyzeduration"]);
/** Options known to take a value (never an output). Unknown options are assumed flags, so a stray token fails closed. */
const VALUE_OPTS = new Set(["v", "loglevel", "ss", "sseof", "t", "to", "itsoffset", "r", "s", "vf", "af", "filter", "filter_complex", "c", "codec", "vcodec", "acodec", "b", "ab", "q", "qscale", "frames", "vframes", "aframes", "map", "metadata", "map_metadata", "pix_fmt", "preset", "crf", "ar", "ac", "framerate", "vsync", "fps_mode", "threads", "start_number", "update", "pattern_type", "movflags", "fflags", "disposition", "aspect", "g", "bf", "profile", "level", "tune", "stream_loop", "loop", "probesize", "analyzeduration", "sws_flags", "hwaccel", "t_start", "timestamp"]);

const block = (reason: string): Prompt => ({ kind: "block", title: "Motion critic sandbox", reason: `motion-critic is read-only outside the review pack: ${reason}` });

/** ffprobe's explicit output and report flags are writers, not format options. */
function ffprobeViolation(segment: string, reviewDir: string, cwd: string): string | null {
  const tokens = commandTokens(segment).slice(1);
  if (tokens.some((t) => /^-+(?:o|report|graph|graph_file)(?:=|$)/.test(t))) return "ffprobe output/report/graph files are forbidden";
  const lavfi = tokens.some((t, i) => t === "-f=lavfi" || (t === "-f" && tokens[i + 1] === "lavfi"));
  if (lavfi) {
    let seen = false;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i] ?? "";
      if (token.startsWith("-")) {
        const [name] = token.replace(/^-+/, "").split("=");
        if (PROBE_VALUES.has(name ?? "")) { if (!token.includes("=")) i++; continue; }
        if (name !== "i") continue;
      }
      const graph = token.startsWith("-i=") ? token.slice(3) : token === "-i" ? tokens[++i] : token;
      seen = true;
      const why = graph === undefined ? "ffprobe lavfi graph is missing" : filterViolation(graph, reviewDir, cwd);
      if (why) return why;
    }
    if (!seen) return "ffprobe lavfi graph is missing";
  }
  return null;
}

/** Reason an ffmpeg segment is not allowed, or `null`. */
function ffmpegViolation(segment: string, reviewDir: string, cwd: string): string | null {
  const tokens = commandTokens(segment);
  let lavfi = false;
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i] ?? "";
    if (t === "-") continue;
    if (!t.startsWith("-")) {
      if (!inside(t, cwd, reviewDir)) return `ffmpeg output ${t} is outside the review dir`;
      continue;
    }
    const name = t.replace(/^-+/, "");
    const eq = name.indexOf("=");
    const inline = eq >= 0 ? name.slice(eq + 1) : undefined;
    const base = (eq >= 0 ? name.slice(0, eq) : name).split(":")[0] ?? "";
    if (CWD_WRITERS.has(base)) return `ffmpeg -${base} writes a log in the working directory`;
    if (["x264-params", "x264opts", "graph", "graph_file", "filter_script", "filter_complex_script"].includes(base)) return `ffmpeg -${base} contains opaque or indirect options`;
    if (base === "i") {
      const input = inline ?? tokens[++i];
      const why = lavfi ? input === undefined ? "ffmpeg lavfi graph is missing" : filterViolation(input, reviewDir, cwd) : null;
      lavfi = false;
      if (why) return why;
      continue;
    }
    const value = inline ?? (PATH_OPTS.has(base) || FILTER_OPTS.has(base) || base === "f" || VALUE_OPTS.has(base) ? tokens[++i] : undefined);
    if (base === "f") lavfi = value === "lavfi";
    if (FILTER_OPTS.has(base)) {
      const why = value === undefined ? "ffmpeg filter is missing" : filterViolation(value, reviewDir, cwd);
      if (why) return why;
    }
    if (base === "f" && BAD_MUXERS.has(value ?? "")) return `ffmpeg -f ${value} writes indirect outputs`;
    if (PATH_OPTS.has(base) && (value === undefined || !inside(value, cwd, reviewDir))) return `ffmpeg -${base} target ${value ?? "(none)"} is outside the review dir`;
  }
  return null;
}

function bashViolation(command: string, reviewDir: string, cwd: string): Prompt | null {
  if (hasSubstitution(command)) return block("command substitution is not allowed");
  for (const seg of shellSegments(command)) {
    if (hasEnvPrefix(seg)) return block("environment-variable prefixes are not allowed");
    const verb = segmentVerb(seg);
    if (!VERBS.has(verb)) return block(`\`${verb || seg}\` is not allowed (ffprobe, ffmpeg, ls, stat only)`);
    const why = verb === "ffmpeg" ? ffmpegViolation(seg, reviewDir, cwd) : verb === "ffprobe" ? ffprobeViolation(seg, reviewDir, cwd) : null;
    if (why) return block(why);
  }
  const targets = motionRedirectTargets(command);
  const bad = targets.find((t) => t !== "/dev/null" && !inside(t, cwd, reviewDir));
  return bad !== undefined ? block(`redirection to ${bad || "(unparsed)"} is outside the review dir`) : null;
}

/**
 * Check one tool call made by an active `motion-critic`.
 * @param reviewDir - Absolute review-pack directory.
 * @param cwd - Directory relative paths resolve against.
 * @returns A block prompt, or `null` when allowed (or the tool is not covered).
 */
export function criticViolation(tool: string, filePath: string | undefined, command: string | undefined, reviewDir: string, cwd: string): Prompt | null {
  if (MOTION_WRITE_TOOLS.has(tool)) return block(`${tool} is forbidden`);
  if (tool === "Read") {
    if (!filePath) return block("Read without a path");
    if (MEDIA_EXT.has(extname(basename(filePath)).toLowerCase()) || inside(filePath, cwd, reviewDir)) return null;
    return block(`Read ${filePath} is not an image/video nor inside the review dir`);
  }
  if (tool === "Bash") return command ? bashViolation(command, reviewDir, cwd) : null;
  return null;
}
