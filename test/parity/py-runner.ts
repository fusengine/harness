import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Decision } from "./fixtures";

/** Root of the Python `core-guards` plugin used as the parity reference. */
export const PY_ROOT: string =
  process.env.FUSE_PARITY_PYTHON_ROOT ??
  join(homedir(), "Downloads", "agents-main", "plugins", "core-guards");

const PRE = join(PY_ROOT, "scripts", "pre-tool-use");

/** Bash PreToolUse decision guards (stateful cache/verbosity hooks excluded). */
const BASH_GUARDS = ["bash-write-guard", "git-guard", "install-guard", "security-guard"] as const;

/** True when python3 and the reference guard scripts are both available. */
export function pythonRefAvailable(): boolean {
  if (!existsSync(join(PRE, "security-guard.py"))) return false;
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runGuard(script: string, payload: string, cwd: string): Decision {
  let out = "";
  try {
    out = execFileSync("python3", [join(PRE, `${script}.py`)], {
      input: payload,
      cwd,
      encoding: "utf-8",
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: PY_ROOT, RALPH_MODE: "" },
    });
  } catch {
    return "allow";
  }
  const text = out.trim();
  if (!text) return "allow";
  try {
    const pd = (JSON.parse(text) as { hookSpecificOutput?: { permissionDecision?: string } })
      .hookSpecificOutput?.permissionDecision;
    return pd === "deny" ? "block" : pd === "ask" ? "ask" : "allow";
  } catch {
    return "allow";
  }
}

/**
 * Run the Python Bash guard chain and reduce to one verdict (block > ask >
 * allow). A fresh non-git cwd disables the guards' `ralph_mode` branch sniffing
 * so the outcome is deterministic regardless of the caller's git branch.
 */
export function pyBashDecision(command: string): Decision {
  const cwd = mkdtempSync(join(tmpdir(), "fh-parity-"));
  const payload = JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command },
  });
  let sawAsk = false;
  for (const g of BASH_GUARDS) {
    const d = runGuard(g, payload, cwd);
    if (d === "block") return "block";
    if (d === "ask") sawAsk = true;
  }
  return sawAsk ? "ask" : "allow";
}
