/**
 * PostToolUse side-effect trackers for non-core scopes (carto/security/
 * changelog). Pure side-effects — never produces stdout.
 */
import type { NormalizedEvent } from "../normalize";
import type { PluginScope } from "./dispatch";
import { trackEnrichment } from "./cartographer/track-enrichment";
import { trackSkillRead } from "./security/track-skill-read";
import { trackMcpResearch } from "./security/track-mcp";
import { trackWatchResearch } from "./changelog-research";

/**
 * Dispatch the appropriate PostToolUse tracker for the invoking scope. Carto
 * persists manual enrichments; security records skill reads + MCP research;
 * changelog records watch research. Side-effect only.
 * @param scope - The invoking plugin scope.
 * @param event - The normalized event.
 * @param input - The raw tool input.
 * @param now - Clock.
 */
export function postTrackingSideEffects(scope: PluginScope, event: NormalizedEvent, input: Record<string, unknown>, now: number): void {
  if (scope === "carto" && (event.tool === "Edit" || event.tool === "Write") && event.filePath) {
    trackEnrichment(event.filePath);
    return;
  }
  if (scope === "security") {
    trackSkillRead(event.tool, event.filePath ?? "", now);
    trackMcpResearch(event.tool, input, now);
    return;
  }
  if (scope === "changelog") {
    trackWatchResearch(event.tool, input, now);
  }
}
