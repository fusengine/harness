/**
 * Codex maps `AskForApproval::Never` -> `permission_mode: "bypassPermissions"`
 * in its hook payload (codex-rs/core/src/hook_runtime.rs::hook_permission_mode)
 * — the only value that isolates `never`; the other three approval policies
 * (`untrusted`, `on-failure`, `on-request`) all collapse to `"default"`.
 * Verified at openai/codex@342e4d4b, hook_runtime.rs run_pre_tool_use_hooks +
 * pre_tool_use.rs PreToolUseRequest. Undocumented implementation detail, not
 * a public contract — see the mapping-regression test that pins this string.
 * @param permissionMode - The payload's `permission_mode` field, if present.
 * @returns True only on an EXACT match — fail-closed. A near-miss
 * (`"BypassPermissions"`, `"bypassPermissions "`, or a substring match) must
 * never accidentally grant the neverApproval exemption.
 */
export function isBypassPermissions(permissionMode: string | undefined): boolean {
  return permissionMode === "bypassPermissions";
}
