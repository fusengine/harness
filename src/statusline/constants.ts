/** Time interval constants (ms). */
export const TIME_INTERVALS = { MINUTE_MS: 60_000, HOUR_MS: 3_600_000 } as const;

/** Percentage thresholds for progressive coloring. */
export const COLOR_THRESHOLDS = { WARNING: 70, CRITICAL: 90 } as const;

/** Fill/empty glyphs per progress-bar style. */
export const PROGRESS_CHARS = {
  blocks: { fill: "█", empty: "░" },
  bars: { fill: "▰", empty: "▱" },
} as const;

/** Defaults for {@link generateProgressBar}. */
export const PROGRESS_BAR_DEFAULTS = { STYLE: "blocks", LENGTH: 10 } as const;

/** 9 gradient blocks from empty to full. */
export const GRADIENT_BLOCKS = [" ", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"] as const;
