/**
 * `harness prd` CLI tests. Fixtures mirror the README's `auth-refactor`
 * worked example (see `test/cli/prd-fixtures.ts`).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPrdStatus } from "../../src/cli/prd/status";
import { runPrdValidate } from "../../src/cli/prd/validate";
import { runPrdCompact } from "../../src/cli/prd/compact";
import { buildFixture, capture, tmpRoot, writeExtraRouter } from "./prd-fixtures";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function root(): string {
  const dir = tmpRoot();
  roots.push(dir);
  return dir;
}

describe("harness prd status", () => {
  test("no flags -> exit 0, table with router/agents/sub-task counts", async () => {
    const r0 = root();
    buildFixture(r0);
    const r = await capture(() => runPrdStatus(["--root", r0], r0, {}));
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("auth-refactor");
    expect(r.stdout).toContain("assigned");
    expect(r.stdout).toContain("2");
    expect(r.stdout).toContain("1/2");
  });

  test("--json -> parsable JSON with router/taskFiles/reports", async () => {
    const r0 = root();
    buildFixture(r0);
    const r = await capture(() => runPrdStatus(["--root", r0, "--json"], r0, {}));
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { router: unknown; taskFiles: unknown; reports: unknown };
    expect(parsed.router).toBeDefined();
    expect(parsed.taskFiles).toBeDefined();
    expect(parsed.reports).toBeDefined();
  });

  test("no router at a resolved --id -> exit 1 with message", async () => {
    const r0 = root();
    const r = await capture(() => runPrdStatus(["--root", r0, "--id", "claude-code"], r0, {}));
    expect(r.code).toBe(1);
    expect(r.stderr.length).toBeGreaterThan(0);
  });

  test("no --id and no router anywhere -> exit 2 (unresolvable)", async () => {
    const r0 = root();
    const r = await capture(() => runPrdStatus(["--root", r0], r0, {}));
    expect(r.code).toBe(2);
  });

  test("ambiguous --id (two segments with a router) -> exit 2", async () => {
    const r0 = root();
    buildFixture(r0);
    writeExtraRouter(r0, ".codex");
    const r = await capture(() => runPrdStatus(["--root", r0], r0, {}));
    expect(r.code).toBe(2);
  });
});

describe("harness prd validate", () => {
  test("no FUSE_PRD -> exit 1", async () => {
    const r0 = root();
    buildFixture(r0, true);
    const r = await capture(() => runPrdValidate(["auth-refactor", "--root", r0], r0, {}));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("FUSE_PRD=1");
  });

  test("FUSE_PRD=1, missing report for backend-expert-2 -> exit 1, violation listed, files unchanged", async () => {
    const r0 = root();
    buildFixture(r0, false);
    const taskPath = join(r0, ".claude", "apex", "prd", "auth-refactor-prd.json");
    const before = readFileSync(taskPath, "utf8");
    const r = await capture(() => runPrdValidate(["auth-refactor", "--root", r0], r0, { FUSE_PRD: "1" }));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("violation");
    expect(r.stderr).toContain("backend-expert-2");
    expect(readFileSync(taskPath, "utf8")).toBe(before);
  });

  test("FUSE_PRD=1, both reports done -> exit 0, sub-tasks validated, router validated", async () => {
    const r0 = root();
    buildFixture(r0, true);
    const r = await capture(() => runPrdValidate(["auth-refactor", "--root", r0], r0, { FUSE_PRD: "1" }));
    expect(r.code).toBe(0);
    const taskFile = JSON.parse(readFileSync(join(r0, ".claude", "apex", "prd", "auth-refactor-prd.json"), "utf8"));
    expect(taskFile["backend-expert"]["sub-tasks"]["jwt-validation"].status).toBe("validated");
    expect(taskFile["backend-expert"]["sub-tasks"]["jwt-validation"]["validated-at"]).toBeDefined();
    expect(taskFile["backend-expert-2"]["sub-tasks"]["session-store"].status).toBe("validated");
    const router = JSON.parse(readFileSync(join(r0, ".claude", "apex", "prd.json"), "utf8"));
    expect(router["auth-refactor"].status).toBe("validated");
  });

  test("lock held -> exit 1", async () => {
    const r0 = root();
    buildFixture(r0, true);
    mkdirSync(join(r0, ".claude", "apex", "prd", ".lock"), { recursive: true });
    const r = await capture(() => runPrdValidate(["auth-refactor", "--root", r0], r0, { FUSE_PRD: "1" }));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("lock");
  }, 10_000);
});

describe("harness prd compact", () => {
  test("no FUSE_PRD -> exit 1", async () => {
    const r0 = root();
    buildFixture(r0, true);
    const r = await capture(() => runPrdCompact(["auth-refactor", "--root", r0], r0, {}));
    expect(r.code).toBe(1);
  });

  test("FUSE_PRD=1 before validation -> exit 1 refusal", async () => {
    const r0 = root();
    buildFixture(r0, true);
    const r = await capture(() => runPrdCompact(["auth-refactor", "--root", r0], r0, { FUSE_PRD: "1" }));
    expect(r.code).toBe(1);
  });

  test("FUSE_PRD=1 after validation -> exit 0, entries compacted, router unchanged", async () => {
    const r0 = root();
    buildFixture(r0, true);
    const before = await capture(() => runPrdValidate(["auth-refactor", "--root", r0], r0, { FUSE_PRD: "1" }));
    expect(before.code).toBe(0);
    const routerBefore = readFileSync(join(r0, ".claude", "apex", "prd.json"), "utf8");
    const r = await capture(() => runPrdCompact(["auth-refactor", "--root", r0], r0, { FUSE_PRD: "1" }));
    expect(r.code).toBe(0);
    const taskFile = JSON.parse(readFileSync(join(r0, ".claude", "apex", "prd", "auth-refactor-prd.json"), "utf8"));
    expect(taskFile["backend-expert"].status).toBe("validated");
    expect(taskFile["backend-expert"].files).toEqual(["src/auth/login.ts"]);
    expect(readFileSync(join(r0, ".claude", "apex", "prd.json"), "utf8")).toBe(routerBefore);
  });
});

describe("harness prd via the binary", () => {
  const bin = join(import.meta.dir, "..", "..", "src", "cli", "bin.ts");

  test("status via `bun bin.ts prd status --root <tmp>` -> prints the table", () => {
    const r0 = root();
    buildFixture(r0);
    const out = execFileSync("bun", [bin, "prd", "status", "--root", r0], { encoding: "utf8" });
    expect(out).toContain("auth-refactor");
  });

  test("<root>/.env with FUSE_PRD=1 lets compact run without the var in the process env", () => {
    const r0 = root();
    buildFixture(r0, true);
    writeFileSync(join(r0, ".env"), "FUSE_PRD=1\n");
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.FUSE_PRD;
    execFileSync("bun", [bin, "prd", "validate", "auth-refactor", "--root", r0], { encoding: "utf8", env });
    const out = execFileSync("bun", [bin, "prd", "compact", "auth-refactor", "--root", r0], { encoding: "utf8", env });
    expect(out).toContain("compacted");
  });
});
