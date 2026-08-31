import { JsonPrimitiveScanner } from "./json-primitive-scanner";

/**
 * Fixed cardinality bounds used by the incremental Cursor JSON scanner.
 * `maxDepth` counts simultaneously open containers. Deeper valid JSON remains
 * indeterminate and the oversized Cursor path fails closed.
 */
export const CURSOR_SCANNER_LIMITS = { tokenEntries: 256, maxDepth: 1024 } as const;

type Frame =
  | { kind: "object"; state: "keyOrEnd" | "key" | "colon" | "value" | "commaOrEnd"; key?: string }
  | { kind: "array"; state: "valueOrEnd" | "value" | "commaOrEnd" };

/** Incrementally validates JSON and extracts the last top-level Cursor event name. */
export class CursorEventScanner {
  private frames: Frame[] = [];
  private mode: "normal" | "string" | "primitive" = "normal";
  private token: number[] = [];
  private tokenOverflow = false;
  private primitive: JsonPrimitiveScanner | undefined;
  private escaped = false;
  private unicode = 0;
  private rootStarted = false;
  private rootComplete = false;
  private invalid = false;
  private event: string | undefined;

  /** Consume another raw JSON byte chunk without retaining the payload. */
  write(chunk: Uint8Array): void {
    for (const byte of chunk) this.consume(byte);
  }

  /** Return the event only when the complete stream is valid JSON. */
  finish(): string | undefined {
    if (this.mode === "primitive") this.endPrimitive();
    if (this.mode !== "normal" || this.frames.length > 0 || !this.rootComplete) this.invalid = true;
    return this.invalid ? undefined : this.event;
  }

  private consume(byte: number): void {
    if (this.invalid) return;
    if (this.mode === "string") { this.stringByte(byte); return; }
    if (this.mode === "primitive") {
      if (!isDelimiter(byte)) {
        if (!this.primitive?.write(byte)) this.invalid = true;
        return;
      }
      this.endPrimitive();
      if (this.invalid) return;
    }
    if (isWhitespace(byte)) return;
    if (byte === 0x22) { this.startString(); return; }
    if (byte === 0x7b || byte === 0x5b) { this.startContainer(byte === 0x7b ? "object" : "array"); return; }
    if (byte === 0x7d || byte === 0x5d) { this.endContainer(byte === 0x7d ? "object" : "array"); return; }
    if (byte === 0x3a) { this.colon(); return; }
    if (byte === 0x2c) { this.comma(); return; }
    if (isPrimitiveStart(byte)) { this.startPrimitive(byte); return; }
    this.invalid = true;
  }

  private startString(): void {
    this.mode = "string";
    this.token = [0x22];
    this.tokenOverflow = false;
    this.escaped = false;
    this.unicode = 0;
  }

  private startPrimitive(byte: number): void {
    this.mode = "primitive";
    this.primitive = new JsonPrimitiveScanner(byte);
  }

  private stringByte(byte: number): void {
    this.pushToken(byte);
    if (this.unicode > 0) {
      if (!isHex(byte)) { this.invalid = true; return; }
      this.unicode -= 1;
      return;
    }
    if (this.escaped) {
      if (byte === 0x75) this.unicode = 4;
      else if (![0x22, 0x5c, 0x2f, 0x62, 0x66, 0x6e, 0x72, 0x74].includes(byte)) this.invalid = true;
      this.escaped = false;
      return;
    }
    if (byte === 0x5c) { this.escaped = true; return; }
    if (byte < 0x20) { this.invalid = true; return; }
    if (byte !== 0x22) return;
    this.mode = "normal";
    const value = this.tokenOverflow ? undefined : decodeString(this.token);
    if (value === null) { this.invalid = true; return; }
    this.acceptString(value);
  }

  private acceptString(value: string | undefined): void {
    const frame = this.frames.at(-1);
    if (frame?.kind === "object" && (frame.state === "key" || frame.state === "keyOrEnd")) {
      frame.key = value;
      frame.state = "colon";
      return;
    }
    this.acceptValue("string", value);
  }

  private startContainer(kind: "object" | "array"): void {
    this.acceptValue(kind);
    if (this.invalid) return;
    if (this.frames.length >= CURSOR_SCANNER_LIMITS.maxDepth) { this.invalid = true; return; }
    this.frames.push(kind === "object" ? { kind, state: "keyOrEnd" } : { kind, state: "valueOrEnd" });
  }

  private endContainer(kind: "object" | "array"): void {
    const frame = this.frames.at(-1);
    const valid = frame?.kind === kind && (kind === "object"
      ? frame.state === "keyOrEnd" || frame.state === "commaOrEnd"
      : frame.state === "valueOrEnd" || frame.state === "commaOrEnd");
    if (!valid) { this.invalid = true; return; }
    this.frames.pop();
    if (this.frames.length === 0) this.rootComplete = true;
  }

  private acceptValue(kind: "string" | "primitive" | "object" | "array", value?: string): void {
    if (this.rootComplete) { this.invalid = true; return; }
    const frame = this.frames.at(-1);
    if (!frame) {
      if (this.rootStarted) { this.invalid = true; return; }
      this.rootStarted = true;
      if (kind === "string" || kind === "primitive") this.rootComplete = true;
      return;
    }
    const expected = frame.kind === "object" ? frame.state === "value" : frame.state === "value" || frame.state === "valueOrEnd";
    if (!expected) { this.invalid = true; return; }
    if (frame.kind === "object") {
      if (this.frames.length === 1 && frame.key === "hook_event_name") this.event = kind === "string" ? value : undefined;
      frame.key = undefined;
    }
    frame.state = "commaOrEnd";
  }

  private colon(): void {
    const frame = this.frames.at(-1);
    if (frame?.kind !== "object" || frame.state !== "colon") { this.invalid = true; return; }
    frame.state = "value";
  }

  private comma(): void {
    const frame = this.frames.at(-1);
    if (!frame || frame.state !== "commaOrEnd") { this.invalid = true; return; }
    frame.state = frame.kind === "object" ? "key" : "value";
  }

  private endPrimitive(): void {
    const valid = this.primitive?.finish() === true;
    this.mode = "normal";
    this.primitive = undefined;
    if (valid) this.acceptValue("primitive");
    else this.invalid = true;
  }

  private pushToken(byte: number): void {
    if (this.token.length < CURSOR_SCANNER_LIMITS.tokenEntries) this.token.push(byte);
    else this.tokenOverflow = true;
  }
}

function decodeString(bytes: number[]): string | null {
  try { const value: unknown = JSON.parse(Buffer.from(bytes).toString("utf8")); return typeof value === "string" ? value : null; }
  catch { return null; }
}

function isWhitespace(byte: number): boolean { return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d; }
function isDelimiter(byte: number): boolean { return isWhitespace(byte) || [0x2c, 0x5d, 0x7d].includes(byte); }
function isPrimitiveStart(byte: number): boolean { return byte === 0x2d || byte === 0x74 || byte === 0x66 || byte === 0x6e || byte >= 0x30 && byte <= 0x39; }
function isHex(byte: number): boolean { return byte >= 0x30 && byte <= 0x39 || byte >= 0x41 && byte <= 0x46 || byte >= 0x61 && byte <= 0x66; }
