const CREATE_RE = /\b(?:create|implement|add|build|new|feature|component|generate|make|develop|scaffold)\b/i;
const SKIP_RE = /\b(?:fix|bug|debug|update|refactor|rename|move|delete|remove|commit|push|edit|modify|change)\b/i;

/**
 * True when a prompt expresses creation intent (a new feature/component) and is
 * not a fix/refactor — the signal that brainstorming should precede creation.
 * The harness calls this on UserPromptSubmit, then `recordBrainstormRequired`.
 */
export function detectCreationIntent(prompt: string): boolean {
  return CREATE_RE.test(prompt) && !SKIP_RE.test(prompt);
}
