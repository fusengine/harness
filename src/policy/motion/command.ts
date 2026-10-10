/**
 * @module motion/command
 * Classify a Bash command against the declared render pipeline (G1/G2 input).
 *
 * Deliberately conservative (an over-match costs one approval prompt, an
 * under-match skips a gate): the render entry is matched on the RAW command
 * text, so a `sh -c "… --stage master"` wrapper is still caught, and a
 * non-literal stage (`--stage "$S"`) counts as `master`. Known limit: an
 * indirect invocation without any stage argument (a package.json script, an
 * alias, `eval`) is invisible here; the post-tool state guard covers it.
 */
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";
import { canonicalFilePath } from "../../runtime/prd/prd-canon";
import { motionShellWriteTargets } from "./shell-targets";
import { segments, tokenize } from "../shell-read-refs";
import { commandTokens } from "./shell-verbs";
import type { MotionCommand, MotionProject, MotionStage } from "../interfaces/motion";
import { commandContexts } from "./command-context";

const STAGE_RANK: Record<MotionStage, number> = { stills: 0, draft: 1, master: 2 };
const STAGE_RE = /--stage(?:=|\s+)([^\s;&|)]*)/g;

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when `command` names the declared render entry (or the conventional `render.sh`). */
export function invokesRender(command: string, render: string | undefined): boolean {
  if (render && /\s/.test(render) && command.replace(/\s+/g, " ").includes(render.replace(/\s+/g, " "))) return true;
  const names = new Set(["render.sh"]);
  if (render && !/\s/.test(render)) names.add(basename(render));
  if (render) {
    const declared = tokenize(render);
    for (const entry of declared.slice(1)) {
      if (!entry.startsWith("-") && /[/.]/.test(entry)) names.add(basename(entry));
    }
  }
  return [...names].some((n) => new RegExp(`(?:^|[\\s/'"=;&|(])${escapeRe(n)}(?=$|[\\s'";&|)])`).test(command));
}

/** Highest `--stage` value in `command`; a non-literal value counts as `master`, none as `stills`. */
export function renderStage(command: string): MotionStage {
  let best: MotionStage = "stills";
  for (const m of command.matchAll(STAGE_RE)) {
    const raw = (m[1] ?? "").replace(/^['"]|['"]$/g, "");
    const stage: MotionStage = raw === "stills" || raw === "draft" || raw === "master" ? raw : "master";
    if (STAGE_RANK[stage] > STAGE_RANK[best]) best = stage;
  }
  for (const token of flatTokens(command)) {
    if ((token === "draft" || token === "master") && STAGE_RANK[token] > STAGE_RANK[best]) best = token;
  }
  return best;
}

/**
 * Quote-stripped tokens of a segment; a token holding whitespace (an
 * `sh -c "ffmpeg ..."` payload) is kept whole AND re-tokenized so the inner
 * command is seen too.
 */
function flatTokens(seg: string): string[] {
  const strip = (t: string): string => t.replace(/^["']+|["']+$/g, "");
  return tokenize(seg).flatMap((t) => (/\s/.test(t) ? [strip(t), ...tokenize(t).map(strip)] : [strip(t)]));
}

/**
 * True when an `ffmpeg` segment names a declared master path anywhere but as
 * an `-i` input (i.e. as an output).
 * @param command - Raw Bash command.
 * @param cwd - Directory relative tokens resolve against.
 * @param masters - Absolute master paths.
 */
export function ffmpegWritesMaster(command: string, cwd: string, masters: string[]): boolean {
  if (masters.length === 0 || !/\bffmpeg\b/.test(command)) return false;
  const targets = new Set(masters.map(canonicalFilePath));
  for (const seg of segments(command)) {
    const tokens = flatTokens(seg);
    const at = tokens.findIndex((t) => basename(t) === "ffmpeg");
    if (at < 0) continue;
    for (let i = at + 1; i < tokens.length; i++) {
      const t = tokens[i] ?? "";
      if (t.startsWith("-") || tokens[i - 1] === "-i") continue;
      if (targets.has(canonicalFilePath(resolve(cwd, t.replace(/^file:/, ""))))) return true;
    }
  }
  return false;
}

/** True when a shell redirect or known writer targets a declared master, independently of ffmpeg. */
function bashWritesMaster(command: string, cwd: string, masters: string[]): boolean {
  const targets = new Set(masters.map(canonicalFilePath));
  return shellMotionWriteTargets(command).some((path) => targets.has(canonicalFilePath(resolve(cwd, path))));
}

/** Actual shell output destinations, excluding copy sources and ffmpeg -i inputs. */
export function shellMotionWriteTargets(command: string): string[] {
  const paths = motionShellWriteTargets(command);
  for (const path of copyDestinations(command)) paths.push(path);
  const tokens = flatTokens(command);
  const at = tokens.findIndex((token) => basename(token) === "ffmpeg");
  if (at >= 0) {
    for (let i = at + 1; i < tokens.length; i++) {
      const token = tokens[i] ?? "";
      if (!token.startsWith("-") && tokens[i - 1] !== "-i") paths.push(token.replace(/^file:/, ""));
    }
  }
  return paths;
}

/** Expand cp/mv directory destinations using the source basename, including GNU target-directory forms. */
function copyDestinations(segment: string): string[] {
  const tokens = commandTokens(segment);
  if (!["cp", "mv", "rsync", "ln", "ditto", "install"].includes(basename(tokens[0] ?? ""))) return [];
  const sources: string[] = [];
  let dir: string | undefined;
  let optionsEnded = false;
  let noDirectory = false;
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    if (!optionsEnded && token === "--") { optionsEnded = true; continue; }
    if (!optionsEnded && (token === "-t" || token === "--target-directory")) { dir = tokens[++i]; continue; }
    if (!optionsEnded && /^(?:--target-directory=.+|-t.+)$/.test(token)) { dir = token.replace(/^(?:--target-directory=|-t)/, ""); continue; }
    if (!optionsEnded && (token === "-T" || token === "--no-target-directory")) noDirectory = true;
    if (!optionsEnded && token.startsWith("-")) continue;
    sources.push(token);
  }
  const destination = dir ?? sources.pop();
  if (!destination) return [];
  return [destination, ...(!noDirectory ? sources.map((source) => join(destination, basename(source))) : [])];
}

/**
 * Stage a classified command counts as in the render budget: `master` when it
 * writes a declared master (via ffmpeg or a master render), else the render stage.
 * @param cmd - Classification from {@link classifyMotionCommand}.
 * @returns The stage to open/close, or `undefined` when the command is not a render.
 */
export function budgetStage(cmd: MotionCommand): MotionStage | undefined {
  return cmd.ffmpegMaster ? "master" : cmd.renderStage;
}

/**
 * Classify a Bash command for the approval gates.
 * @param command - Raw Bash command.
 * @param cwd - Hook working directory.
 * @param project - The resolved motion project.
 */
export function classifyMotionCommand(command: string, cwd: string, project: MotionProject, home: string = homedir()): MotionCommand {
  let stage: MotionStage | undefined;
  let master = false;
  for (const [segment, directory] of commandContexts(command, cwd, home)) {
    const candidate = renderStage(segment);
    if ((invokesRender(segment, project.render) || (candidate !== "stills" && (/--stage(?:=|\s)/.test(segment) || /[$*?[]/.test(segment))))
      && (stage === undefined || STAGE_RANK[candidate] > STAGE_RANK[stage])) stage = candidate;
    master ||= ffmpegWritesMaster(segment, directory, project.masters) || bashWritesMaster(segment, directory, project.masters);
  }
  return { renderStage: stage, ffmpegMaster: master };
}
