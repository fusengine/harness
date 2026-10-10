/** Narrow non-null objects; arrays are rejected unless a legacy reader explicitly admits them. */
export function isRecordObject(value: unknown, allowArrays = false): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && (allowArrays || !Array.isArray(value));
}

/** Preserve the original object identity, or supply an empty record for invalid input. */
export function recordObject(value: unknown, allowArrays = false): Record<string, unknown> {
  return isRecordObject(value, allowArrays) ? value : {};
}
