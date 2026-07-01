/**
 * Compose the Radix vs Base UI weighted detection, ported verbatim from
 * `detect-primitive-lib.py`'s `main()`. Pure aggregation over
 * {@link checkPkgJson}/{@link checkComponentsJson}/{@link scanImportsAndAttrs}/
 * {@link detectPm} (`./detect-primitive-checks`).
 */
import { checkComponentsJson, checkPkgJson, detectPm, scanImportsAndAttrs, type PackageManager } from "./detect-primitive-checks";

export type { PackageManager } from "./detect-primitive-checks";

/** Which shadcn/ui primitive library the project uses, per the weighted signal score. */
export type PrimitiveLib = "radix" | "base-ui" | "mixed" | "none";

/** Result of {@link detectPrimitiveLib}. */
export interface PrimitiveDetection {
  primitive: PrimitiveLib;
  confidence: number;
  pm: PackageManager;
  runner: string;
  signals: string[];
}

/**
 * Detect whether `root` uses Radix UI or Base UI as its shadcn/ui primitive,
 * from weighted signals (package.json 40, components.json style 20, imports 25,
 * data attributes 15). `"mixed"` when both accumulate signal, `"none"` when
 * neither does.
 * @param root - project root to scan (defaults to `process.cwd()`).
 */
export function detectPrimitiveLib(root: string = process.cwd()): PrimitiveDetection {
  const signals: string[] = [];
  const [r1, b1] = checkPkgJson(root, signals);
  const [r2, b2] = checkComponentsJson(root, signals);
  const [r3, b3] = scanImportsAndAttrs(root, signals);
  const [pm, runner] = detectPm(root, signals);
  const radix = r1 + r2 + r3;
  const baseui = b1 + b2 + b3;

  let primitive: PrimitiveLib;
  let confidence: number;
  if (radix > 0 && baseui > 0) {
    primitive = "mixed";
    confidence = Math.floor((radix + baseui) / 2);
  } else if (radix > baseui) {
    primitive = "radix";
    confidence = radix;
  } else if (baseui > radix) {
    primitive = "base-ui";
    confidence = baseui;
  } else {
    primitive = "none";
    confidence = 0;
  }
  return { primitive, confidence, pm, runner, signals };
}
