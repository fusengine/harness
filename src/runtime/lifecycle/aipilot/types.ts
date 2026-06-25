/**
 * Cache + APEX interfaces for the ai-pilot scope (separated from implementation
 * per SOLID interface-segregation).
 */

/** Index file for the per-project documentation cache. */
export interface CacheIndex {
  project: string;
  docs: CacheEntry[];
}

/** Single cached document entry in the doc index. */
export interface CacheEntry {
  hash: string;
  library: string;
  topic: string;
  timestamp: string;
  size_kb: number;
}

/** Lesson entry extracted from a sniper transcript. */
export interface LessonEntry {
  error_type: string;
  pattern: string;
  fix: string;
  count: number;
  last_seen: string;
  files: string[];
  code: { line: string[] };
}

/** An Edit tool_use extracted from a sniper transcript. */
export interface EditEntry {
  file: string;
  oldStr: string;
  newStr: string;
}

/** Cached lint/test result for a single source file. */
export interface TestResult {
  checksum: string;
  eslint: "pass" | "fail";
  tsc: "pass" | "fail";
  last_tested: string;
}

/** Test cache structure stored on disk. */
export interface TestCache {
  timestamp: string;
  files: Record<string, TestResult>;
}

/** A task entry in `.claude/apex/task.json`. */
export interface ApexTask {
  subject: string;
  description: string;
  status: string;
  phase: string;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
  doc_consulted: Record<string, unknown>;
  files_modified: string[];
  blockedBy?: string[];
}

/** Structure of `.claude/apex/task.json`. */
export interface ApexTaskFile {
  current_task: string;
  created_at: string;
  tasks: Record<string, ApexTask>;
}
