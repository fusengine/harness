/**
 * @module interfaces/motion
 * Shared types of the `motion` scope (fuse-motion plugin approval gates).
 */
import type { NormalizedEvent } from "../../runtime/normalize";

/** A render stage (`stills` is the ungated default of `--stage`). */
export type MotionStage = "stills" | "draft" | "master";

/** A stage the owner can approve: approving `stills` unlocks `draft`, approving `draft` unlocks `master`. */
export type ApprovableStage = "stills" | "draft";

/** Resolved `.motion/project.json` (every path absolute). */
export interface MotionProject {
  /** Project root (the directory holding `.motion/`). */
  root: string;
  /** Declared render entry: a script path, or a command string when it contains whitespace. */
  render?: string;
  /** Absolute draft mp4 path. */
  draft?: string;
  /** Absolute master output paths. */
  masters: string[];
  /** Absolute directory whose writes are scanned for sensitive data (defaults to the root). */
  sourceDir: string;
  /** Absolute review-pack directory (the only place `motion-critic` may write). */
  reviewDir: string;
  /** Absolute contact sheet path (`.motion/stills/contact.png`). */
  contact: string;
}

/** One owner approval, bound to the artifact content hash. */
export interface MotionApproval {
  /** Authenticated format version; absent on legacy records. */
  version?: 1;
  /** Project binding; absent on legacy records. */
  rootKey?: string;
  /** HMAC-SHA256 hex signature; absent on invalid legacy records. */
  signature?: string;
  stage: ApprovableStage;
  artifact: string;
  sha256: string;
  code: string;
  approvedAt: number;
  sessionId: string;
}

/** An approval the gate asked for, waiting for the owner's `MOTION-APPROVE <stage> <code>`. */
export interface MotionPending {
  stage: ApprovableStage;
  artifact: string;
  sha256: string;
  code: string;
  createdAt: number;
  sessionId: string;
}

/** Render counters (per stage), accumulated wall time, and in-flight render starts. */
export interface MotionBudget {
  renders: Partial<Record<MotionStage, number>>;
  wallMs: Partial<Record<MotionStage, number>>;
  /** In-flight render start times keyed by `tool_use_id`. */
  inflight: Record<string, { stage: MotionStage; ts: number }>;
}

/** What a Bash command does with respect to the render pipeline. */
export interface MotionCommand {
  /** Stage of a declared render entry invocation (`stills` when `--stage` is omitted), else undefined. */
  renderStage?: MotionStage;
  /** True when an `ffmpeg` invocation writes to a declared master output path. */
  ffmpegMaster: boolean;
}

/** What a host-native hook event means for the `motion` scope. */
export type MotionKind = "subagentStart" | "subagentStop" | "prompt" | "pre" | "post" | "failure" | "stop" | "none";

/** Persistent protected state; existing outputs are accepted once at activation. */
export interface MotionState {
  version: 1;
  project: MotionProject;
  sessions: string[];
  protected: Record<string, string>;
  artifacts: Record<string, string | null>;
  renders: Record<string, { session: string; stage: MotionStage; command: string }>;
  invalid: boolean;
  /** A recovered witness must invalidate before any receipt can be accepted. */
  registryFault?: boolean;
  /** Cold outputs cannot authorize G2 until their matching authorized render completes. */
  coldArtifacts?: string[];
}

/** One host hook call reduced to the Claude-shaped view the motion gates read. */
export interface MotionCall {
  kind: MotionKind;
  /** Event name handed to `respond()` (Cursor needs its native event name). */
  respondAs: string;
  /** Normalized event with the tool name made canonical (`Bash`/`Write`/`Edit`/`Read`). */
  event: NormalizedEvent;
  /** User prompt text (kind `prompt` only). */
  text: string;
  /** False when the prompt provably did not come from the owner's own typing. */
  human: boolean;
}
