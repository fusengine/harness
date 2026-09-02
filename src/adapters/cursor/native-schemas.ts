/**
 * @module native-schemas
 * Per-event field validators for Cursor's documented native stdout contract.
 * Extracted from native-response.ts to keep that module focused on the
 * passthrough decision logic (SOLID file-size split, not a plafond workaround).
 *
 * Field lists are binary-verified against Cursor 3.18.25 (agent-cli
 * `190.index.js` / `workbench.desktop.main.js`, validators `R`/`Ded`) and
 * match the published hooks documentation.
 */

/** A single-field runtime type check used to build a {@link NativeSchema}. */
export type FieldValidator = (value: unknown) => boolean;

/** The exact field set (and per-field validator) Cursor reads for one event. */
export interface NativeSchema {
  fields: Readonly<Record<string, FieldValidator>>;
  required?: readonly string[];
}

const stringValue: FieldValidator = (value) => typeof value === "string";
const booleanValue: FieldValidator = (value) => typeof value === "boolean";

/** A plain `{}`-literal or `Object.create(null)` object — never a class instance or array. */
export const plainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
};

type JsonFrame = { value: unknown; leave?: false } | { value: object; leave: true };

function jsonChildren(value: object): unknown[] | null {
  const keys = Reflect.ownKeys(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const length = descriptors.length;
    if (!length || !("value" in length) || !Number.isSafeInteger(length.value) || length.value < 0) return null;
    if (keys.length !== length.value + 1 || keys.some((key) => typeof key === "symbol")) return null;
    const children: unknown[] = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor?.enumerable || !("value" in descriptor)) return null;
      children.push(descriptor.value);
    }
    return children;
  }
  if (!plainRecord(value) || keys.some((key) => typeof key === "symbol")) return null;
  const children: unknown[] = [];
  for (const key of keys) {
    const descriptor = descriptors[key as string];
    if (!descriptor?.enumerable || !("value" in descriptor)) return null;
    children.push(descriptor.value);
  }
  return children;
}

function jsonValue(root: unknown): boolean {
  const active = new WeakSet<object>();
  const stack: JsonFrame[] = [{ value: root }];
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.leave) {
      active.delete(frame.value);
      continue;
    }
    const { value } = frame;
    if (value === null || typeof value === "string" || typeof value === "boolean") continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return false;
      continue;
    }
    if (typeof value !== "object" || active.has(value)) return false;
    let children: unknown[] | null;
    try {
      children = jsonChildren(value);
    } catch {
      return false;
    }
    if (!children) return false;
    active.add(value);
    stack.push({ value, leave: true });
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push({ value: children[index] });
  }
  return true;
}

/** A JSON-safe plain object (no cycles, no non-finite numbers, no exotic prototypes). */
export const recordValue: FieldValidator = (value) => plainRecord(value) && jsonValue(value);
const stringRecord: FieldValidator = (value) => {
  if (!recordValue(value)) return false;
  try {
    return Object.values(Object.getOwnPropertyDescriptors(value as object))
      .every((descriptor) => "value" in descriptor && typeof descriptor.value === "string");
  } catch {
    return false;
  }
};
const stringArray: FieldValidator = (value) => Array.isArray(value) && value.every(stringValue);
const permission = (...values: string[]): FieldValidator => (value) => typeof value === "string" && values.includes(value);

const EMPTY: NativeSchema = { fields: {} };
const FOLLOWUP: NativeSchema = { fields: { followup_message: stringValue } };
const PERMISSION_ASK: NativeSchema = {
  fields: { permission: permission("allow", "deny", "ask"), user_message: stringValue, agent_message: stringValue },
  required: ["permission"],
};

const PRE_TOOL_USE: NativeSchema = {
  fields: {
    permission: permission("allow", "deny", "ask"),
    user_message: stringValue,
    agent_message: stringValue,
    updated_input: recordValue,
    additional_context: stringValue,
  },
  required: ["permission"],
};

/**
 * Exact native stdout field set Cursor 3.18.25 reads per hook event.
 * Nothing beyond this list is invented: any additional key on a candidate
 * value fails {@link isNativeCursorResponse} in native-response.ts.
 */
export const NATIVE_SCHEMAS: Readonly<Record<string, NativeSchema>> = {
  sessionStart: {
    fields: { env: stringRecord, additional_context: stringValue, continue: booleanValue, user_message: stringValue },
  },
  sessionEnd: EMPTY,
  beforeSubmitPrompt: {
    fields: { continue: booleanValue, user_message: stringValue, additional_context: stringValue },
    required: ["continue"],
  },
  preCompact: { fields: { user_message: stringValue } },
  subagentStart: {
    fields: { permission: permission("allow", "deny"), user_message: stringValue }, required: ["permission"],
  },
  subagentStop: FOLLOWUP,
  preToolUse: PRE_TOOL_USE,
  postToolUse: { fields: { updated_mcp_tool_output: recordValue, additional_context: stringValue } },
  postToolUseFailure: { fields: { additional_context: stringValue } },
  beforeShellExecution: PERMISSION_ASK,
  afterShellExecution: EMPTY,
  beforeMCPExecution: PERMISSION_ASK,
  afterMCPExecution: EMPTY,
  beforeReadFile: {
    fields: { permission: permission("allow", "deny"), user_message: stringValue }, required: ["permission"],
  },
  afterFileEdit: EMPTY,
  beforeTabFileRead: { fields: { permission: permission("allow", "deny") }, required: ["permission"] },
  afterTabFileEdit: EMPTY,
  afterAgentResponse: EMPTY,
  afterAgentThought: EMPTY,
  stop: FOLLOWUP,
  workspaceOpen: { fields: { pluginPaths: stringArray } },
};
