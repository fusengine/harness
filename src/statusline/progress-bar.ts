import { GRADIENT_BLOCKS, PROGRESS_BAR_DEFAULTS, PROGRESS_CHARS } from "./constants";
import { progressiveColor } from "./colors";

/** Options for {@link generateProgressBar}. */
export interface ProgressBarOptions {
  style?: keyof typeof PROGRESS_CHARS;
  length?: number;
  useProgressiveColor?: boolean;
  showPercentage?: boolean;
}

const clampPct = (p: number): number => Math.max(0, Math.min(100, Number.isNaN(p) ? 0 : p));

/** Render a fill/empty progress bar. */
export function generateProgressBar(percentage: number, options: ProgressBarOptions = {}): string {
  const {
    style = PROGRESS_BAR_DEFAULTS.STYLE, length = PROGRESS_BAR_DEFAULTS.LENGTH,
    useProgressiveColor = false, showPercentage = false,
  } = options;
  const pct = clampPct(percentage);
  const filled = Math.round((pct / 100) * length);
  const empty = Math.max(0, length - filled);
  const chars = PROGRESS_CHARS[style];
  let bar = chars.fill.repeat(filled) + chars.empty.repeat(empty);
  if (useProgressiveColor) bar = progressiveColor(pct, bar);
  if (showPercentage) {
    const pctText = `${Math.round(pct)}%`;
    bar += ` ${useProgressiveColor ? progressiveColor(pct, pctText) : pctText}`;
  }
  return bar;
}

/** Render a fine-grained gradient bar (sub-block resolution). */
export function generateGradientBar(percentage: number, length = 10): string {
  const pct = clampPct(percentage);
  const exact = (pct / 100) * length;
  const full = Math.floor(exact);
  const remainder = exact - full;
  let bar = GRADIENT_BLOCKS[8].repeat(full);
  if (full < length && remainder > 0) {
    bar += GRADIENT_BLOCKS[Math.floor(remainder * 8)] ?? "";
  }
  const remaining = length - bar.length;
  if (remaining > 0) bar += " ".repeat(remaining);
  return progressiveColor(pct, bar);
}
