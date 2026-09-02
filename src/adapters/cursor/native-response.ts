import { NATIVE_SCHEMAS, recordValue, type NativeSchema } from "./native-schemas";

/**
 * Check that every enumerable own key of `value` is a documented field for
 * `eventName` and passes its validator, and that every required field is
 * present. Rejects prototype-polluted or exotic-shaped candidates via
 * {@link recordValue}.
 * @param value - Parsed JSON candidate.
 * @param eventName - The Cursor hook event the candidate would answer.
 */
function isNativeCursorResponse(value: unknown, eventName: string): boolean {
  try {
    if (!recordValue(value)) return false;
    const schema = NATIVE_SCHEMAS[eventName as keyof typeof NATIVE_SCHEMAS] as NativeSchema | undefined;
    if (!schema) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value as object);
    if (schema.required?.some((field) => !Object.hasOwn(descriptors, field))) return false;
    return Reflect.ownKeys(descriptors).every((field) => {
      if (typeof field !== "string") return false;
      const descriptor = descriptors[field];
      if (!Object.hasOwn(schema.fields, field)) return false;
      const validate = schema.fields[field];
      return descriptor?.enumerable === true && "value" in descriptor
        && validate !== undefined && validate(descriptor.value);
    });
  } catch {
    return false;
  }
}

/** Preserve raw stdout only when JSON.parse proves a documented native Cursor response. */
export function parseNativeCursorStdout(stdout: string, eventName: string): string | null {
  if (typeof stdout !== "string") return null;
  try {
    return isNativeCursorResponse(JSON.parse(stdout), eventName) ? stdout : null;
  } catch {
    return null;
  }
}
