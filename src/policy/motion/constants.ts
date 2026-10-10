/** @module motion/constants — shared canonical writer tools. */

/** Canonical normalized tools that can create or replace file content. */
export const MOTION_WRITE_TOOLS: ReadonlySet<string> = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "apply_patch"]);
