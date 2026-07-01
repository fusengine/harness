/**
 * @module integrity
 * HMAC-SHA256 tamper-evident wrapping for {@link SessionTrack}.
 *
 * Failure policy: ONLY a MAC mismatch causes fail-closed (returns null).
 * The nonce is included in the signed payload and written to disk for advisory
 * diagnostics, but is NOT checked during verification — concurrent hook
 * invocations (PostToolUse, SubagentStop, …) legitimately load the same
 * envelope after the nonce watermark advances; a monotonic check would trigger
 * spurious fail-closed behaviour mid-session.
 *
 * The machine key is readable by the same agent process, so this deters naive
 * out-of-band tampering — not a determined re-sign. Item B (transcript-grounded
 * freshness) is the primary guarantee.
 * @packageDocumentation
 */
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fuseHarnessHome } from "../runtime/home-state";
import type { SessionTrack } from "./session-state";

const HARNESS_DIR = fuseHarnessHome();
const KEY_PATH = join(HARNESS_DIR, ".key");
const NONCE_PATH = join(HARNESS_DIR, ".nonce");

/** Signed envelope wrapping a JSON-serialised {@link SessionTrack}. */
export interface TrackEnvelope {
  /** JSON-serialised SessionTrack. */
  data: string;
  /** Advisory timestamp (Date.now() at sign time); embedded in the MAC. */
  nonce: number;
  /** HMAC-SHA256 hex digest over `"${nonce}:${data}"`. */
  mac: string;
}

/** Load (or create on first use) the per-machine HMAC key stored at mode 0600. */
function loadOrCreateKey(): string {
  mkdirSync(HARNESS_DIR, { recursive: true });
  if (!existsSync(KEY_PATH)) {
    const key = randomBytes(32).toString("hex");
    writeFileSync(KEY_PATH, key, { encoding: "utf8", mode: 0o600 });
    return key;
  }
  return readFileSync(KEY_PATH, "utf8").trim();
}

/**
 * Persist the last-seen nonce for advisory diagnostics (mode 0600).
 * Never read during {@link verifyTrack} — see module JSDoc for rationale.
 */
export function writeLastNonce(nonce: number): void {
  mkdirSync(HARNESS_DIR, { recursive: true });
  writeFileSync(NONCE_PATH, String(nonce), { encoding: "utf8", mode: 0o600 });
}

/** Compute HMAC-SHA256 over the canonical message `"${nonce}:${data}"`. */
function computeMac(key: string, data: string, nonce: number): string {
  return createHmac("sha256", key).update(`${nonce}:${data}`).digest("hex");
}

/**
 * Sign a {@link SessionTrack} into a tamper-evident envelope. The nonce
 * (`Date.now()`) is embedded in the MAC to bind the timestamp to the payload.
 */
export function signTrack(track: SessionTrack): TrackEnvelope {
  const key = loadOrCreateKey();
  const data = JSON.stringify(track);
  const nonce = Date.now();
  return { data, nonce, mac: computeMac(key, data, nonce) };
}

/**
 * Verify a {@link TrackEnvelope}. Returns the parsed {@link SessionTrack} on
 * success, or `null` ONLY on MAC mismatch / parse failure (fail-closed on
 * tampering). The nonce is NOT checked — see module JSDoc.
 */
export function verifyTrack(envelope: TrackEnvelope): SessionTrack | null {
  try {
    const key = loadOrCreateKey();
    if (envelope.mac !== computeMac(key, envelope.data, envelope.nonce)) return null;
    return JSON.parse(envelope.data) as SessionTrack;
  } catch {
    return null;
  }
}
