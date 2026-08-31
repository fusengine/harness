type FieldValidator = (value: unknown) => boolean;

interface NativeSchema {
  fields: Readonly<Record<string, FieldValidator>>;
  required?: readonly string[];
}

const stringValue: FieldValidator = (value) => typeof value === "string";
const booleanValue: FieldValidator = (value) => typeof value === "boolean";
const plainRecord = (value: unknown): value is Record<string, unknown> => {
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

const recordValue: FieldValidator = (value) => plainRecord(value) && jsonValue(value);
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

const NATIVE_SCHEMAS = {
  sessionStart: {
    fields: { env: stringRecord, additional_context: stringValue, continue: booleanValue, user_message: stringValue },
  },
  sessionEnd: EMPTY,
  beforeSubmitPrompt: { fields: { continue: booleanValue, user_message: stringValue }, required: ["continue"] },
  preCompact: { fields: { user_message: stringValue } },
  subagentStart: {
    fields: { permission: permission("allow", "deny"), user_message: stringValue }, required: ["permission"],
  },
  subagentStop: FOLLOWUP,
  preToolUse: {
    fields: { ...PERMISSION_ASK.fields, updated_input: recordValue }, required: ["permission"],
  },
  postToolUse: { fields: { updated_mcp_tool_output: recordValue, additional_context: stringValue } },
  postToolUseFailure: EMPTY,
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
} as const satisfies Record<string, NativeSchema>;

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
