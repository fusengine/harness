import { COLOR_THRESHOLDS } from "./constants";

/** A text-decorating function. */
export type ColorFn = (text: string) => string;

const ansi = (code: string): ColorFn => (text) => `\x1b[${code}m${text}\x1b[0m`;
const ansi256 = (code: number): ColorFn => (text) => `\x1b[38;5;${code}m${text}\x1b[0m`;

/** Forced ANSI palette (every entry is a colorizer, plus reset + support flag). */
export interface Palette {
  blue: ColorFn; cyan: ColorFn; green: ColorFn; yellow: ColorFn; red: ColorFn;
  magenta: ColorFn; white: ColorFn; gray: ColorFn; purple: ColorFn; orange: ColorFn;
  brightRed: ColorFn; brightYellow: ColorFn; brightGreen: ColorFn;
  bold: ColorFn; dim: ColorFn; reset: string; isSupported: boolean;
}

/** Forced ANSI color helpers (ignore TTY detection). */
export const colors: Palette = {
  blue: ansi("0;34"), cyan: ansi("0;36"), green: ansi("0;32"),
  yellow: ansi("0;33"), red: ansi("0;31"), magenta: ansi("0;35"),
  white: ansi("0;37"), gray: ansi256(240), purple: ansi256(135), orange: ansi256(208),
  brightRed: ansi("1;91"), brightYellow: ansi("1;93"), brightGreen: ansi("1;92"),
  bold: ansi("1"), dim: ansi("2"), reset: "\x1b[0m", isSupported: true,
};

/** Color `text` by threshold: green < WARNING <= yellow < CRITICAL <= red. */
export function progressiveColor(value: number, text: string): string {
  if (value >= COLOR_THRESHOLDS.CRITICAL) return colors.brightRed(text);
  if (value >= COLOR_THRESHOLDS.WARNING) return colors.brightYellow(text);
  return colors.green(text);
}
