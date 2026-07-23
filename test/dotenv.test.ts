import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnvFile, envCandidates, loadDotenv } from "../src/config/dotenv";

test("parseEnvFile: export/plain/quotes/comments", () => {
  const dir = mkdtempSync(join(tmpdir(), "fh-env-"));
  const f = join(dir, ".env");
  writeFileSync(f, [
    "# comment",
    "",
    'export NEURAL_MEMORY_HOST="graphiti.local"',
    "GRAPHITI_PORT=9000",
    "export QUOTED='single'",
    "  export SPACED = nope ",
  ].join("\n"));
  const env = parseEnvFile(f);
  expect(env.NEURAL_MEMORY_HOST).toBe("graphiti.local");
  expect(env.GRAPHITI_PORT).toBe("9000");
  expect(env.QUOTED).toBe("single");
});

test("parseEnvFile: CRLF line endings strip trailing carriage return", () => {
  const dir = mkdtempSync(join(tmpdir(), "fh-envcrlf-"));
  const f = join(dir, ".env");
  writeFileSync(f, 'PORT=9000\r\nexport HOST="local"\r\n');
  const env = parseEnvFile(f);
  expect(env.PORT).toBe("9000"); // no trailing \r
  expect(env.HOST).toBe("local");
});

test("parseEnvFile: missing file -> {}", () => {
  expect(parseEnvFile(join(tmpdir(), "does-not-exist-xyz", ".env"))).toEqual({});
});

test("envCandidates: home dir per harness + cwd", () => {
  expect(envCandidates("claude-code", "/h", "/p")).toEqual(["/h/.claude/.env", "/p/.env"]);
  expect(envCandidates("codex", "/h", "/p")).toEqual(["/h/.codex/.env", "/p/.env"]);
  expect(envCandidates("unknown", "/h", "/p")).toEqual(["/h/.claude/.env", "/p/.env"]);
});

test("envCandidates: KIMI_CODE_HOME relocates the kimi .env probe", () => {
  const prev = process.env.KIMI_CODE_HOME;
  process.env.KIMI_CODE_HOME = "/data/kimi";
  try {
    expect(envCandidates("kimi", "/h", "/p")).toEqual(["/data/kimi/.env", "/p/.env"]);
  } finally {
    if (prev === undefined) delete process.env.KIMI_CODE_HOME;
    else process.env.KIMI_CODE_HOME = prev;
  }
  expect(envCandidates("kimi", "/h", "/p")).toEqual(["/h/.kimi-code/.env", "/p/.env"]);
});

test("loadDotenv: hydrates missing keys, never overwrites existing", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-envhome-"));
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(join(home, ".claude", ".env"), 'export NEURAL_MEMORY_HOST="from-file"\nexport GRAPHITI_PORT="8000"\n');
  const cwd = mkdtempSync(join(tmpdir(), "fh-envcwd-"));
  const env: NodeJS.ProcessEnv = { GRAPHITI_PORT: "already-set" };
  loadDotenv("claude-code", env, home, cwd);
  expect(env.NEURAL_MEMORY_HOST).toBe("from-file"); // hydrated
  expect(env.GRAPHITI_PORT).toBe("already-set");    // real env wins
});
