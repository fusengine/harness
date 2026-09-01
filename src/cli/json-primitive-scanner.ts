type NumberState = "minus" | "zero" | "integer" | "dot" | "fraction" | "exponentMark" | "exponentSign" | "exponent";

/** Validate one JSON literal or number incrementally with constant state. */
export class JsonPrimitiveScanner {
  private literal: "true" | "false" | "null" | undefined;
  private literalIndex = 0;
  private number: NumberState | undefined;
  private valid = true;

  constructor(firstByte: number) {
    if (firstByte === 0x74) { this.literal = "true"; this.literalIndex = 1; }
    else if (firstByte === 0x66) { this.literal = "false"; this.literalIndex = 1; }
    else if (firstByte === 0x6e) { this.literal = "null"; this.literalIndex = 1; }
    else if (firstByte === 0x2d) this.number = "minus";
    else if (firstByte === 0x30) this.number = "zero";
    else if (isOneToNine(firstByte)) this.number = "integer";
    else this.valid = false;
  }

  /** Consume one non-delimiter byte and report whether the prefix stays valid. */
  write(byte: number): boolean {
    if (!this.valid) return false;
    if (this.literal) {
      this.valid = this.literal.charCodeAt(this.literalIndex) === byte;
      this.literalIndex += 1;
      return this.valid && this.literalIndex <= this.literal.length;
    }
    this.valid = this.writeNumber(byte);
    return this.valid;
  }

  /** Return whether the accumulated primitive is complete JSON grammar. */
  finish(): boolean {
    if (!this.valid) return false;
    if (this.literal) return this.literalIndex === this.literal.length;
    return this.number === "zero" || this.number === "integer" || this.number === "fraction" || this.number === "exponent";
  }

  private writeNumber(byte: number): boolean {
    if (this.number === "minus") return this.digitAfter(byte, "zero", "integer");
    if (this.number === "zero") return this.afterInteger(byte, false);
    if (this.number === "integer") {
      if (isDigit(byte)) return true;
      return this.afterInteger(byte, true);
    }
    if (this.number === "dot") {
      if (!isDigit(byte)) return false;
      this.number = "fraction";
      return true;
    }
    if (this.number === "fraction") {
      if (isDigit(byte)) return true;
      return this.startExponent(byte);
    }
    if (this.number === "exponentMark") {
      if (byte === 0x2b || byte === 0x2d) { this.number = "exponentSign"; return true; }
      return this.digitAfter(byte, "exponent", "exponent");
    }
    if (this.number === "exponentSign") return this.digitAfter(byte, "exponent", "exponent");
    return this.number === "exponent" && isDigit(byte);
  }

  private afterInteger(byte: number, digitAllowed: boolean): boolean {
    if (digitAllowed && isDigit(byte)) return true;
    if (byte === 0x2e) { this.number = "dot"; return true; }
    return this.startExponent(byte);
  }

  private startExponent(byte: number): boolean {
    if (byte !== 0x65 && byte !== 0x45) return false;
    this.number = "exponentMark";
    return true;
  }

  private digitAfter(byte: number, zero: NumberState, nonzero: NumberState): boolean {
    if (byte === 0x30) { this.number = zero; return true; }
    if (isOneToNine(byte)) { this.number = nonzero; return true; }
    return false;
  }
}

function isDigit(byte: number): boolean { return byte >= 0x30 && byte <= 0x39; }
function isOneToNine(byte: number): boolean { return byte >= 0x31 && byte <= 0x39; }
