/**
 * Swift / Apple skill-trigger patterns, ported verbatim from
 * `swift_skill_triggers.py`. 9 skills.
 *
 * NOTE: Swift uses case-SENSITIVE matching (source `re.search` WITHOUT
 * `re.IGNORECASE`). The framework name is registered in
 * `CASE_SENSITIVE_FRAMEWORKS` so the gate compiles these without the `i` flag.
 */

/** Map of Swift sub-skill name → triggering code patterns (case-sensitive). */
export const SWIFT_TRIGGERS: Readonly<Record<string, ReadonlyArray<string>>> = {
  "swiftui-core": ["\\bstruct\\s+\\w+\\s*:\\s*View\\b", "@State\\b", "@Binding\\b",
    "@Observable\\b", "@Environment\\b", "NavigationStack\\b",
    "\\.sheet\\b", "\\.toolbar\\b", "\\.task\\b"],
  "swift-core": ["\\bactor\\b", "\\basync\\s+(let|func|throws)\\b",
    "\\bawait\\b", "Task\\s*\\{", "TaskGroup\\b", "Sendable\\b", "@MainActor\\b"],
  "ios": ["UIKit|UIViewController|UIView\\b", "UIApplication\\b",
    "\\.simulatorId\\b", "import\\s+UIKit\\b"],
  "macos": ["AppKit|NSViewController|NSWindow\\b", "NSApplication\\b",
    "\\.menuBar\\b", "import\\s+AppKit\\b"],
  "watchos": ["WatchKit|WKInterface|WKExtension\\b", "HealthKit|HKWorkout\\b",
    "WatchConnectivity\\b"],
  "visionos": ["RealityKit|RealityView|ImmersiveSpace\\b",
    "\\.volumeBaseplateVisibility\\b", "SpatialTapGesture\\b"],
  "ipados": ["UISplitViewController|UIKeyCommand\\b", "\\.horizontalSizeClass\\b",
    "pencilInteraction\\b"],
  "tvos": ["TVUIKit|focusable\\b", "\\.focusSection\\b", "TVMonogram\\b"],
  "build-distribution": ["TestFlight|AppStore\\b", "\\.entitlements\\b",
    "codesign|notarize|archive\\b"],
};
