# Swift-Native Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the warm colour-as-data token system and the Swift-native component set from `docs/superpowers/specs/2026-07-20-swift-native-visual-system-design.md`, reviewable end-to-end in a DEBUG-only component gallery — without touching the four working Phase 2 screens.

**Architecture:** A new `Theme2` namespace is added alongside the existing `Theme`, so the current screens keep compiling untouched while the new system is built and reviewed. Components live in `Loggi/DesignSystem/` as small, single-responsibility files, each consuming only `Theme2` tokens. A DEBUG-only `GalleryView` (reachable via `loggi://gallery`) renders every component in every state, plus two full-screen compositions — one populated, one empty. A Swift unit test enforces the spec's contrast and CVD rules directly against the shipped token values, so the palette can't silently drift.

**Tech Stack:** SwiftUI (iOS 17 floor), Swift Charts, XCTest, XcodeGen. No new dependencies.

## Global Constraints

- Work in the worktree: `/Users/muhammadbalagamwala/Documents/Projects/2026/SnapCal/.claude/worktrees/swift-rewrite`. Regenerate with `cd apps/ios && xcodegen generate` after any file-set or `project.yml` change.
- **The spec is binding.** `docs/superpowers/specs/2026-07-20-swift-native-visual-system-design.md`. Where this plan's sample code and the spec disagree, the spec wins — every prior phase in this project found real bugs in its own plan's sample code, so treat the samples as a starting point, not gospel.
- **Do NOT modify** `TodayView`, `HistoryView`, `WeightView`, `SettingsView`, or the existing `Theme` enum. They keep working on the old tokens until a later phase. Task 7 is the only task allowed to touch `RootView`, and only inside `#if DEBUG`.
- **Exact token values** (spec §3.0/§3.1/§3.3) — copy verbatim, do not re-derive:
  - Canvas: light `#FAF6EF`, dark `#1A1613`
  - Raised surface: light `#FFFCF7`, dark `#241F1A`
  - Protein: light `#4A1D4E`, dark `#F0C4F4`
  - Carbs: light `#7D3A82`, dark `#C48ACA`
  - Fat: light `#B072B5`, dark `#94599B`
  - On target: light `#116149`, dark `#4ECB92`
  - Over target: light `#A5003C`, dark `#FF6FA0`
  - Vermilion (reserved, unchanged): `#E64A19`
- **Fat is graphic-only** in both themes (~3.2:1). It may fill a bar or chart mark; it may NEVER be used for text or for a text-adjacent glyph that carries meaning alone. Task 2's test enforces the value; no automated check can catch misuse, so every task that renders `fat` must self-check this.
- **Colour is never the only signal** (spec §3.3a, WCAG 1.4.1). Wherever on-target and over-target can both appear, the distinction MUST also carry an SF Symbol or text. On-target vs over-target is ΔE 2.0 in dark mode — indistinguishable to a deuteranope without the redundant channel.
- **Dynamic Type everywhere** (spec §4). No fixed `Font.system(size:)` in any new component. Use semantic text styles, or `.custom(_:relativeTo:)` when a specific size is genuinely needed. Numeric figures keep `.monospacedDigit()`.
- **Reduce Motion** must be honoured on every animation: gate with `@Environment(\.accessibilityReduceMotion)`.
- Verify on the simulator with an explicitly-selected UDID — never bare `booted`.
  **Boot first and fail loudly if nothing is booted**, otherwise `-destination "id="`
  is empty and `xcodebuild` prints its help text instead of building — which looks
  nothing like a failure and wasted a cycle during this plan's own execution:
  ```bash
  UDID=$(xcrun simctl list devices booted | grep iPhone | sed -n 's/.*(\([A-F0-9-]\{36\}\)) (Booted).*/\1/p' | head -1)
  if [[ -z "$UDID" ]]; then echo "No booted iPhone sim — run: xcrun simctl boot <udid>"; exit 1; fi
  ```
  Build/install/launch/screenshot via `cd apps/ios && bash scripts/dev-loop.sh <path>.png <route>`.
- Commit after each task. Trailers:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01ATRQeGrbsyQDbVga7tLEPA`

## File Structure

| File | Responsibility |
|---|---|
| `Loggi/Theme/Theme2.swift` | New token namespace: colour, type, spacing, motion |
| `LoggiTests/PaletteTests.swift` | Enforces spec §3 contrast + CVD rules on shipped values |
| `Loggi/DesignSystem/MacroBar.swift` | One labelled macro bar (ramp colour + label + value) |
| `Loggi/DesignSystem/CalorieRing.swift` | Hero progress ring (trimmed `Circle`) |
| `Loggi/DesignSystem/StatusBadge.swift` | On-target / over-target pill — colour + symbol + text |
| `Loggi/DesignSystem/SurfaceCard.swift` | Warm raised surface container |
| `Loggi/DesignSystem/CalorieChart.swift` | Swift Charts bar chart w/ accessibility descriptor |
| `Loggi/DesignSystem/EmptyStateView.swift` | Warm, inviting empty state (the §9 risk surface) |
| `Loggi/Gallery/GalleryView.swift` | DEBUG-only gallery: components in all states |
| `Loggi/Gallery/GalleryCompositions.swift` | DEBUG-only full-screen populated + empty compositions |

Rationale for splitting: each component is independently reviewable and testable, and small files keep edits reliable. Gallery code is split from component code so the DEBUG-only surface never leaks into a release build.

---

### Task 1: `Theme2` token namespace

**Files:**
- Create: `apps/ios/Loggi/Theme/Theme2.swift`

**Interfaces:**
- Produces: `enum Theme2` with `canvas`, `surface`, `ink`, `inkSecondary`, `hairline`, `accentLog`, `macroProtein`, `macroCarbs`, `macroFat`, `statusOnTarget`, `statusOver` (all `Color`); `Theme2.Text` (`hero`, `title`, `body`, `label`, `caption` — all `Font`); `Theme2.Space` (`xs`/`s`/`m`/`l`/`xl`: `CGFloat`); `Theme2.Motion.standard` (`Animation`); `Theme2.Radius` (`card`, `control`: `CGFloat`).
- Consumes: nothing. This is the root of the new system.

- [ ] **Step 1: Write `Theme2.swift`**

```swift
import SwiftUI
import UIKit

/// The Swift-native visual system's tokens (spec
/// docs/superpowers/specs/2026-07-20-swift-native-visual-system-design.md).
///
/// Deliberately parallel to the legacy `Theme` rather than replacing it: the
/// four Phase 2 screens keep compiling against `Theme` until a later phase
/// rebuilds them. Do not merge the two.
///
/// The organizing rule (spec §2): every colour here encodes a meaning.
/// Nothing in this file exists to decorate.
enum Theme2 {
    private static func dynamic(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { trait in
            let v = trait.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat((v >> 16) & 0xFF) / 255,
                green: CGFloat((v >> 8) & 0xFF) / 255,
                blue: CGFloat(v & 0xFF) / 255, alpha: 1)
        })
    }
    private static func fixed(_ v: UInt32) -> Color {
        Color(red: Double((v >> 16) & 0xFF) / 255,
              green: Double((v >> 8) & 0xFF) / 255,
              blue: Double(v & 0xFF) / 255)
    }

    // MARK: - Ground (spec §3.0). Nothing is pure white or pure black.
    static let canvas  = dynamic(0xFAF6EF, 0x1A1613)
    static let surface = dynamic(0xFFFCF7, 0x241F1A)
    static let ink          = dynamic(0x1A1613, 0xFAF6EF)
    static let inkSecondary = dynamic(0x5C5349, 0xB5AAA0)
    static let hairline     = dynamic(0xE8E0D4, 0x3A322B)

    // MARK: - Reserved (spec §3.4). "Log something", never data, never chrome.
    static let accentLog = fixed(0xE64A19)

    // MARK: - Macro ramp (spec §3.1). ONE warm hue family, three lightness
    // steps. Order is information: protein darkest -> fat lightest. Never
    // reorder per-screen, and never swap in a different hue per macro — the
    // three-hue version failed CVD validation (dE 3.5 under tritanopia).
    static let macroProtein = dynamic(0x4A1D4E, 0xF0C4F4)
    static let macroCarbs   = dynamic(0x7D3A82, 0xC48ACA)
    /// GRAPHIC-ONLY (~3.2:1 worst-case). Fills and marks only — never text.
    static let macroFat     = dynamic(0xB072B5, 0x94599B)

    // MARK: - Status (spec §3.3). NOT distinguishable from each other by
    // colour alone (dE 2.0 dark / 7.3 light under CVD) — always pair with a
    // symbol or text. `StatusBadge` is the sanctioned way to render these.
    static let statusOnTarget = dynamic(0x116149, 0x4ECB92)
    static let statusOver     = dynamic(0xA5003C, 0xFF6FA0)

    // MARK: - Type (spec §4). Dynamic Type only; no fixed sizes.
    enum Text {
        static let hero    = Font.system(.largeTitle, design: .rounded, weight: .bold).monospacedDigit()
        static let title   = Font.system(.title2, design: .rounded, weight: .semibold)
        static let body    = Font.system(.body)
        static let label   = Font.system(.subheadline, weight: .medium)
        static let caption = Font.system(.caption, weight: .medium)
        /// Figures that must align in columns; scales with Dynamic Type.
        static let figure  = Font.system(.title3, design: .rounded, weight: .semibold).monospacedDigit()
    }

    enum Space {
        static let xs: CGFloat = 4, s: CGFloat = 8, m: CGFloat = 12, l: CGFloat = 16, xl: CGFloat = 24
    }
    enum Radius {
        static let card: CGFloat = 20, control: CGFloat = 12
    }
    enum Motion {
        /// 130ms ease-out. Settles, never bounces — no springs (spec §2.1 "calm").
        static let standard = Animation.timingCurve(0.0, 0.0, 0.58, 1.0, duration: 0.13)
    }
}
```

- [ ] **Step 2: Regenerate and build**

```bash
cd apps/ios && xcodegen generate
UDID=$(xcrun simctl list devices booted | grep iPhone | sed -n 's/.*(\([A-F0-9-]\{36\}\)) (Booted).*/\1/p' | head -1)
[[ -n "$UDID" ]] || { echo "No booted iPhone sim"; exit 1; }
xcodebuild -project Loggi.xcodeproj -scheme Loggi -configuration Debug -destination "id=$UDID" build 2>&1 | tail -5
```
Expected: `** BUILD SUCCEEDED **`. Nothing consumes `Theme2` yet, so this is compile-only.

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Loggi/Theme/Theme2.swift
git commit -m "design-system: Theme2 warm colour-as-data tokens"
```

---

### Task 2: Palette regression test

**Files:**
- Create: `apps/ios/LoggiTests/PaletteTests.swift`
- Modify: `apps/ios/project.yml` (add a `LoggiTests` unit-test target)

**Interfaces:**
- Consumes: `Theme2` (Task 1).
- Produces: nothing consumed by later tasks. This is a guard rail.

Why a Swift test in addition to `scripts/validate-palette.mjs`: the JS validator checks values transcribed into a script, and can drift from what the app actually ships. This test resolves the **real `Theme2` colours** through UIKit in both `.light` and `.dark` trait environments, so it fails if a token is edited, mistyped, or accidentally wired to the wrong hue.

**This is the project's first XCTest target.** There is currently no test bundle: `apps/ios/Loggi/Navigation/RouteTests.swift` is a `#if DEBUG` enum of `assert()` calls compiled into the *app* target, not an XCTest suite. So expect first-time friction — the scheme may not have a Test action wired until `xcodegen` regenerates with the new target, and `@testable import Loggi` requires the app target to build for testing (it does; `ENABLE_TESTABILITY` defaults to YES in Debug). Do **not** convert or move `RouteTests.swift` as part of this task; it works, it is out of scope, and touching it risks the deep-link parsing that Phase 0 spent a fix round getting right.

- [ ] **Step 1: Add the test target to `project.yml`**

Append to the `targets:` map (sibling of `Loggi`, `LoggiWidgets`, `LoggiIntents`):

```yaml
  LoggiTests:
    type: bundle.unit-test
    platform: iOS
    deploymentTarget: "17.0"
    sources: [LoggiTests]
    dependencies:
      - target: Loggi
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.loggi.app.tests
        GENERATE_INFOPLIST_FILE: YES
```

- [ ] **Step 2: Write the failing test**

```swift
import XCTest
import SwiftUI
@testable import Loggi

/// Enforces the spec's §3 colour rules against the SHIPPED Theme2 values.
/// scripts/validate-palette.mjs checks the same maths on transcribed values;
/// this checks what the app actually renders, so the two can't drift apart.
final class PaletteTests: XCTestCase {

    // MARK: - Colour maths (WCAG 2.x relative luminance; CIELAB; Vienot CVD)

    private func rgb(_ color: Color, dark: Bool) -> (r: Double, g: Double, b: Double) {
        let traits = UITraitCollection(userInterfaceStyle: dark ? .dark : .light)
        let resolved = UIColor(color).resolvedColor(with: traits)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        resolved.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b))
    }
    private func lin(_ c: Double) -> Double {
        c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }
    private func luminance(_ c: (r: Double, g: Double, b: Double)) -> Double {
        0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
    }
    private func contrast(_ a: Color, _ b: Color, dark: Bool) -> Double {
        let l1 = luminance(rgb(a, dark: dark)), l2 = luminance(rgb(b, dark: dark))
        return (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)
    }
    private func lab(_ c: (r: Double, g: Double, b: Double)) -> (L: Double, a: Double, b: Double) {
        let r = lin(c.r), g = lin(c.g), bl = lin(c.b)
        var x = (0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047
        var y = 0.2126 * r + 0.7152 * g + 0.0722 * bl
        var z = (0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883
        func f(_ t: Double) -> Double { t > 0.008856 ? cbrt(t) : 7.787 * t + 16.0 / 116.0 }
        x = f(x); y = f(y); z = f(z)
        return (116 * y - 16, 500 * (x - y), 200 * (y - z))
    }
    private func deltaE(_ c1: (r: Double, g: Double, b: Double), _ c2: (r: Double, g: Double, b: Double)) -> Double {
        let a = lab(c1), b = lab(c2)
        return sqrt(pow(a.L - b.L, 2) + pow(a.a - b.a, 2) + pow(a.b - b.b, 2))
    }
    private func lightnessDelta(_ c1: (r: Double, g: Double, b: Double), _ c2: (r: Double, g: Double, b: Double)) -> Double {
        abs(lab(c1).L - lab(c2).L)
    }
    /// Vienot/Brettel dichromat projection in LMS space.
    private func simulate(_ c: (r: Double, g: Double, b: Double), _ type: String) -> (r: Double, g: Double, b: Double) {
        let r = lin(c.r), g = lin(c.g), b = lin(c.b)
        let L = 0.31399 * r + 0.63951 * g + 0.04649 * b
        let M = 0.15537 * r + 0.75789 * g + 0.08670 * b
        let S = 0.01775 * r + 0.10945 * g + 0.87262 * b
        var l = L, m = M, s = S
        switch type {
        case "deuter": m = 0.9513092 * L + 0.04866992 * S
        case "protan": l = 1.05118294 * M - 0.05116099 * S
        case "tritan": s = -0.86744736 * L + 1.86727089 * M
        default: break
        }
        func unlin(_ v: Double) -> Double {
            let c = max(0, min(1, v))
            return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1 / 2.4) - 0.055
        }
        return (unlin(5.47221206 * l - 4.6419601 * m + 0.16963708 * s),
                unlin(-1.1252419 * l + 2.29317094 * m - 0.1678952 * s),
                unlin(0.02980165 * l - 0.19318073 * m + 1.16364789 * s))
    }
    private let visions = ["normal", "deuter", "protan", "tritan"]
    private func sim(_ color: Color, dark: Bool, _ vision: String) -> (r: Double, g: Double, b: Double) {
        let base = rgb(color, dark: dark)
        return vision == "normal" ? base : simulate(base, vision)
    }

    // MARK: - Spec §3.0: every data colour clears 3:1 on BOTH grounds

    func testDataColorsClearBothGrounds() {
        let dataColors: [(String, Color)] = [
            ("protein", Theme2.macroProtein), ("carbs", Theme2.macroCarbs), ("fat", Theme2.macroFat),
            ("onTarget", Theme2.statusOnTarget), ("over", Theme2.statusOver),
        ]
        for dark in [false, true] {
            for (name, color) in dataColors {
                let onCanvas = contrast(color, Theme2.canvas, dark: dark)
                let onSurface = contrast(color, Theme2.surface, dark: dark)
                let worst = min(onCanvas, onSurface)
                XCTAssertGreaterThanOrEqual(
                    worst, 3.0,
                    "\(name) in \(dark ? "dark" : "light") is \(String(format: "%.2f", worst)):1 — " +
                    "below the 3:1 graphic minimum. The RAISED SURFACE is usually the tighter " +
                    "constraint; validating only against the canvas is how this silently fails on cards.")
            }
        }
    }

    /// Spec §3.1: fat is graphic-only by design. This pins the intent so
    /// nobody "fixes" it into text use without confronting the spec.
    func testFatIsGraphicOnlyNotTextSafe() {
        for dark in [false, true] {
            let worst = min(contrast(Theme2.macroFat, Theme2.canvas, dark: dark),
                            contrast(Theme2.macroFat, Theme2.surface, dark: dark))
            XCTAssertGreaterThanOrEqual(worst, 3.0, "fat must still clear the graphic minimum")
            XCTAssertLessThan(worst, 4.5,
                "fat now clears 4.5:1. That's not a failure — but the spec documents it as " +
                "GRAPHIC-ONLY and components rely on that. Update spec §3.1 before relaxing this.")
        }
    }

    // MARK: - Spec §3.1: the ramp separates by LIGHTNESS under every CVD type

    func testMacroRampSeparatesByLightnessUnderAllCVD() {
        let ramp: [(String, Color)] = [
            ("protein", Theme2.macroProtein), ("carbs", Theme2.macroCarbs), ("fat", Theme2.macroFat),
        ]
        for dark in [false, true] {
            for vision in visions {
                for i in 0..<ramp.count {
                    for j in (i + 1)..<ramp.count {
                        let d = lightnessDelta(sim(ramp[i].1, dark: dark, vision),
                                               sim(ramp[j].1, dark: dark, vision))
                        XCTAssertGreaterThanOrEqual(
                            d, 12.0,
                            "\(ramp[i].0)/\(ramp[j].0) differ by only ΔL \(String(format: "%.1f", d)) " +
                            "under \(vision) (\(dark ? "dark" : "light")). The ramp encodes macros by " +
                            "LIGHTNESS precisely because hue collapses under CVD — keep the steps apart.")
                    }
                }
            }
        }
    }

    // MARK: - Spec §3.4: nothing is confusable with reserved vermilion

    func testNoDataColorIsConfusableWithVermilion() {
        let dataColors: [(String, Color)] = [
            ("protein", Theme2.macroProtein), ("carbs", Theme2.macroCarbs), ("fat", Theme2.macroFat),
            ("onTarget", Theme2.statusOnTarget), ("over", Theme2.statusOver),
        ]
        for dark in [false, true] {
            for (name, color) in dataColors {
                for vision in visions {
                    let d = deltaE(sim(color, dark: dark, vision), sim(Theme2.accentLog, dark: dark, vision))
                    XCTAssertGreaterThanOrEqual(
                        d, 20.0,
                        "\(name) is ΔE \(String(format: "%.1f", d)) from vermilion under \(vision) " +
                        "(\(dark ? "dark" : "light")). Vermilion means 'log something' and is co-visible " +
                        "on every screen — no data colour may be mistakable for it.")
                }
            }
        }
    }

    /// Spec §3.3a, documented as a REQUIREMENT rather than a bug: on-target
    /// and over-target genuinely cannot be told apart by colour under CVD.
    /// This test asserts that fact so the redundant symbol/text channel in
    /// StatusBadge is never "optimised away" as belt-and-braces.
    func testStatusPairRequiresNonColorChannel() {
        var worst = Double.infinity
        for dark in [false, true] {
            for vision in visions {
                worst = min(worst, deltaE(sim(Theme2.statusOnTarget, dark: dark, vision),
                                          sim(Theme2.statusOver, dark: dark, vision)))
            }
        }
        XCTAssertLessThan(
            worst, 25.0,
            "on-target and over-target now separate by ΔE \(String(format: "%.1f", worst)) under CVD. " +
            "If that is intentional, update spec §3.3a — but StatusBadge's symbol+text is still " +
            "required by WCAG 1.4.1 regardless.")
    }
}
```

- [ ] **Step 3: Regenerate, then run the tests**

```bash
cd apps/ios && xcodegen generate
UDID=$(xcrun simctl list devices booted | grep iPhone | sed -n 's/.*(\([A-F0-9-]\{36\}\)) (Booted).*/\1/p' | head -1)
[[ -n "$UDID" ]] || { echo "No booted iPhone sim"; exit 1; }
xcodebuild test -project Loggi.xcodeproj -scheme Loggi -destination "id=$UDID" -only-testing:LoggiTests 2>&1 | tail -20
```
Expected: all 5 tests pass. If `testMacroRampSeparatesByLightnessUnderAllCVD` or `testDataColorsClearBothGrounds` fails, a token in Task 1 was mistyped — fix the token, not the threshold.

Note for implementer: if `xcodegen` produces a scheme without the test target attached, add `scheme: {testTargets: [LoggiTests]}` under the `Loggi` target and regenerate. Do not skip running the tests.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/LoggiTests/PaletteTests.swift apps/ios/project.yml
git commit -m "design-system: palette regression test on shipped Theme2 values"
```

---

### Task 3: `SurfaceCard` + `StatusBadge`

**Files:**
- Create: `apps/ios/Loggi/DesignSystem/SurfaceCard.swift`
- Create: `apps/ios/Loggi/DesignSystem/StatusBadge.swift`

**Interfaces:**
- Consumes: `Theme2` (Task 1).
- Produces: `SurfaceCard<Content: View>` (init `SurfaceCard { content }`); `enum GoalStatus { case onTarget, over }` with `.color`, `.symbolName`, `.label`; `StatusBadge(status: GoalStatus, text: String? = nil)`.

- [ ] **Step 1: Write `SurfaceCard.swift`**

```swift
import SwiftUI

/// The warm raised surface (spec §3.0). Every card, row group and sheet
/// background in the new system goes through this — that's what keeps the
/// raised-surface contrast constraint honest, since PaletteTests validates
/// data colours against `Theme2.surface` specifically.
struct SurfaceCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(Theme2.Space.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme2.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme2.Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme2.Radius.card, style: .continuous)
                    .strokeBorder(Theme2.hairline, lineWidth: 1)
            )
    }
}
```

- [ ] **Step 2: Write `StatusBadge.swift`**

```swift
import SwiftUI

/// Goal status. The colour is deliberately NOT the only carrier: on-target and
/// over-target are ΔE 2.0 apart in dark mode under deuteranopia (spec §3.3a,
/// asserted by PaletteTests.testStatusPairRequiresNonColorChannel), so every
/// case ships a symbol and a word alongside its colour.
enum GoalStatus {
    case onTarget, over

    var color: Color {
        switch self {
        case .onTarget: Theme2.statusOnTarget
        case .over:     Theme2.statusOver
        }
    }
    /// The non-colour channel WCAG 1.4.1 requires. Never render the colour
    /// without this symbol (or the label) next to it.
    var symbolName: String {
        switch self {
        case .onTarget: "checkmark.circle.fill"
        case .over:     "exclamationmark.triangle.fill"
        }
    }
    var label: String {
        switch self {
        case .onTarget: "On target"
        case .over:     "Over target"
        }
    }
}

struct StatusBadge: View {
    let status: GoalStatus
    /// Optional detail ("120 over"). The status word is always shown, so the
    /// badge is never colour-only even when this is nil.
    var text: String?

    var body: some View {
        HStack(spacing: Theme2.Space.s) {
            Image(systemName: status.symbolName)
            Text(text ?? status.label)
        }
        .font(Theme2.Text.label)
        .foregroundStyle(status.color)
        .padding(.horizontal, Theme2.Space.m)
        .padding(.vertical, Theme2.Space.s)
        .background(status.color.opacity(0.12), in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(text.map { "\(status.label), \($0)" } ?? status.label)
    }
}
```

- [ ] **Step 3: Build**

```bash
cd apps/ios && xcodegen generate
UDID=$(xcrun simctl list devices booted | grep iPhone | sed -n 's/.*(\([A-F0-9-]\{36\}\)) (Booted).*/\1/p' | head -1)
[[ -n "$UDID" ]] || { echo "No booted iPhone sim"; exit 1; }
xcodebuild -project Loggi.xcodeproj -scheme Loggi -configuration Debug -destination "id=$UDID" build 2>&1 | tail -5
```
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Loggi/DesignSystem/SurfaceCard.swift apps/ios/Loggi/DesignSystem/StatusBadge.swift
git commit -m "design-system: SurfaceCard + StatusBadge (colour always paired with symbol/text)"
```

---

### Task 4: `MacroBar` + `CalorieRing`

**Files:**
- Create: `apps/ios/Loggi/DesignSystem/MacroBar.swift`
- Create: `apps/ios/Loggi/DesignSystem/CalorieRing.swift`

**Interfaces:**
- Consumes: `Theme2` (Task 1).
- Produces: `enum Macro { case protein, carbs, fat }` with `.color`, `.label`; `MacroBar(macro: Macro, grams: Double, goal: Double)`; `CalorieRing(consumed: Double, goal: Double)`.

- [ ] **Step 1: Write `MacroBar.swift`**

```swift
import SwiftUI

/// One macro. The ramp is a single hue family in three lightness steps
/// (spec §3.1) — three distinct hues failed CVD validation. Order carries
/// meaning: protein darkest, fat lightest.
enum Macro: CaseIterable {
    case protein, carbs, fat

    var color: Color {
        switch self {
        case .protein: Theme2.macroProtein
        case .carbs:   Theme2.macroCarbs
        case .fat:     Theme2.macroFat
        }
    }
    var label: String {
        switch self {
        case .protein: "Protein"
        case .carbs:   "Carbs"
        case .fat:     "Fat"
        }
    }
}

/// A labelled macro bar. The label is not decoration — the ramp reads as
/// "one colour" at a glance by design, so the text is what identifies which
/// macro this is. Never render the bar without it.
struct MacroBar: View {
    let macro: Macro
    let grams: Double
    let goal: Double

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var fraction: Double {
        guard goal > 0 else { return 0 }
        return min(grams / goal, 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.s) {
            HStack {
                Text(macro.label)
                    .font(Theme2.Text.label)
                    .foregroundStyle(Theme2.ink)
                Spacer()
                Text("\(Int(grams))/\(Int(goal))g")
                    .font(Theme2.Text.caption)
                    .foregroundStyle(Theme2.inkSecondary)
                    .monospacedDigit()
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme2.hairline)
                    Capsule()
                        .fill(macro.color)
                        .frame(width: geo.size.width * fraction)
                }
            }
            .frame(height: 10)
            .animation(reduceMotion ? nil : Theme2.Motion.standard, value: fraction)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(macro.label)
        .accessibilityValue("\(Int(grams)) of \(Int(goal)) grams")
    }
}
```

- [ ] **Step 2: Write `CalorieRing.swift`**

```swift
import SwiftUI

/// The hero figure. Colour encodes goal status (spec §3.3) and is always
/// accompanied by the numeral plus, when over, a StatusBadge in the composing
/// view — the ring's colour alone never carries the over/under message.
struct CalorieRing: View {
    let consumed: Double
    let goal: Double

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isOver: Bool { goal > 0 && consumed > goal }
    private var fraction: Double {
        guard goal > 0 else { return 0 }
        return min(consumed / goal, 1)
    }
    private var remaining: Int { Int((goal - consumed).rounded()) }
    private var tint: Color { isOver ? Theme2.statusOver : Theme2.statusOnTarget }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Theme2.hairline, lineWidth: 14)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(tint, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(reduceMotion ? nil : Theme2.Motion.standard, value: fraction)
            VStack(spacing: Theme2.Space.xs) {
                Text("\(abs(remaining))")
                    .font(Theme2.Text.hero)
                    .foregroundStyle(Theme2.ink)
                Text(isOver ? "cal over" : "cal left")
                    .font(Theme2.Text.caption)
                    .foregroundStyle(Theme2.inkSecondary)
            }
        }
        .frame(width: 180, height: 180)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(isOver ? "Over target" : "Calories remaining")
        .accessibilityValue("\(abs(remaining)) calories \(isOver ? "over" : "left"), \(Int(consumed)) of \(Int(goal)) eaten")
    }
}
```

Note for implementer: the ring is a fixed 180pt frame, which does NOT scale with Dynamic Type. That is intentional for the circle geometry — but the numeral inside it does scale, so verify at AX5 that the text still fits inside the ring. If it clips, wrap the label in `.minimumScaleFactor(0.6)` and note it in the task report; do not shrink the font token.

- [ ] **Step 3: Build**

```bash
cd apps/ios && xcodegen generate
UDID=$(xcrun simctl list devices booted | grep iPhone | sed -n 's/.*(\([A-F0-9-]\{36\}\)) (Booted).*/\1/p' | head -1)
[[ -n "$UDID" ]] || { echo "No booted iPhone sim"; exit 1; }
xcodebuild -project Loggi.xcodeproj -scheme Loggi -configuration Debug -destination "id=$UDID" build 2>&1 | tail -5
```
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Loggi/DesignSystem/MacroBar.swift apps/ios/Loggi/DesignSystem/CalorieRing.swift
git commit -m "design-system: MacroBar + CalorieRing"
```

---

### Task 5: `CalorieChart` with accessibility descriptor

**Files:**
- Create: `apps/ios/Loggi/DesignSystem/CalorieChart.swift`

**Interfaces:**
- Consumes: `Theme2` (Task 1), `GoalStatus` (Task 3).
- Produces: `CalorieChart.Day` (`Identifiable`: `date: String`, `label: String`, `calories: Double`); `CalorieChart(days: [Day], goal: Double)`.

Swift Charts has real runtime-only failure modes that `BUILD SUCCEEDED` will not catch — Phase 2 hit three of them (categorical labels silently dropped, edge labels failing to render, and an auto y-domain squashing a narrow band). Screenshot this one, don't trust the build.

- [ ] **Step 1: Write `CalorieChart.swift`**

```swift
import SwiftUI
import Charts

/// Daily calories against goal. Per-bar colour encodes goal status, and the
/// dashed rule plus the per-bar accessibility label carry the same information
/// non-visually (spec §3.3a — over/under is never colour-only).
struct CalorieChart: View {
    struct Day: Identifiable {
        let id = UUID()
        let date: String
        let label: String
        let calories: Double
    }

    let days: [Day]
    let goal: Double

    private func status(_ day: Day) -> GoalStatus {
        goal > 0 && day.calories > goal ? .over : .onTarget
    }

    /// Explicit domain: Charts defaults the lower bound toward 0, which
    /// squashes a narrow band into the top of the plot.
    private var yDomain: ClosedRange<Double> {
        let values = days.map(\.calories) + [goal]
        let lo = max(0, (values.min() ?? 0) * 0.85)
        let hi = (values.max() ?? goal) * 1.1
        return lo...(hi > lo ? hi : lo + 1)
    }

    var body: some View {
        Chart {
            ForEach(days) { day in
                BarMark(
                    x: .value("Day", day.label),
                    y: .value("Calories", day.calories)
                )
                .foregroundStyle(status(day).color)
                .cornerRadius(4)
                .accessibilityLabel(day.date)
                .accessibilityValue("\(Int(day.calories)) calories, \(status(day).label)")
            }
            if goal > 0 {
                RuleMark(y: .value("Goal", goal))
                    .foregroundStyle(Theme2.inkSecondary)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    .annotation(position: .top, alignment: .trailing) {
                        Text("Goal \(Int(goal))")
                            .font(Theme2.Text.caption)
                            .foregroundStyle(Theme2.inkSecondary)
                    }
            }
        }
        .chartYScale(domain: yDomain)
        .chartYAxis {
            AxisMarks { _ in
                AxisGridLine().foregroundStyle(Theme2.hairline)
                AxisValueLabel().font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
            }
        }
        .chartXAxis {
            AxisMarks { _ in
                AxisValueLabel().font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
            }
        }
        .frame(height: 180)
        .accessibilityLabel("Daily calories")
    }
}
```

- [ ] **Step 2: Build**

```bash
cd apps/ios && xcodegen generate
UDID=$(xcrun simctl list devices booted | grep iPhone | sed -n 's/.*(\([A-F0-9-]\{36\}\)) (Booted).*/\1/p' | head -1)
[[ -n "$UDID" ]] || { echo "No booted iPhone sim"; exit 1; }
xcodebuild -project Loggi.xcodeproj -scheme Loggi -configuration Debug -destination "id=$UDID" build 2>&1 | tail -5
```
Expected: `** BUILD SUCCEEDED **`. Rendering is verified in Task 7, where the gallery makes it visible.

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Loggi/DesignSystem/CalorieChart.swift
git commit -m "design-system: CalorieChart with per-bar status colour + a11y values"
```

---

### Task 6: `EmptyStateView`

**Files:**
- Create: `apps/ios/Loggi/DesignSystem/EmptyStateView.swift`

**Interfaces:**
- Consumes: `Theme2` (Task 1).
- Produces: `EmptyStateView(title: String, message: String, systemImage: String)`.

This component carries the spec's headline risk (§9.1): a day with no data must read as **calm and inviting, not blank**. It is deliberately generous — large glyph, real breathing room, warm ground — rather than a terse centred line of grey text.

- [ ] **Step 1: Write `EmptyStateView.swift`**

```swift
import SwiftUI

/// The warm empty state (spec §2.1 "happy", §9.1). An empty day is the most
/// common first impression, so it gets real presence rather than an apology.
///
/// Uses SF Symbols rather than Bevi for now: Bevi's poses are PNG assets
/// tuned to the OLD pastel grounds, and re-tuning them for the warm canvas is
/// its own task. This is a deliberate, temporary substitution — the spec
/// keeps Bevi as an identity carrier.
struct EmptyStateView: View {
    let title: String
    let message: String
    var systemImage: String = "leaf"

    var body: some View {
        VStack(spacing: Theme2.Space.l) {
            Image(systemName: systemImage)
                .font(.system(size: 44, weight: .light))
                .foregroundStyle(Theme2.inkSecondary)
                .accessibilityHidden(true)
            VStack(spacing: Theme2.Space.s) {
                Text(title)
                    .font(Theme2.Text.title)
                    .foregroundStyle(Theme2.ink)
                    .multilineTextAlignment(.center)
                Text(message)
                    .font(Theme2.Text.body)
                    .foregroundStyle(Theme2.inkSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, Theme2.Space.xl)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}
```

- [ ] **Step 2: Build**

```bash
cd apps/ios && xcodegen generate
UDID=$(xcrun simctl list devices booted | grep iPhone | sed -n 's/.*(\([A-F0-9-]\{36\}\)) (Booted).*/\1/p' | head -1)
[[ -n "$UDID" ]] || { echo "No booted iPhone sim"; exit 1; }
xcodebuild -project Loggi.xcodeproj -scheme Loggi -configuration Debug -destination "id=$UDID" build 2>&1 | tail -5
```
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Loggi/DesignSystem/EmptyStateView.swift
git commit -m "design-system: warm EmptyStateView"
```

---

### Task 7: The gallery — components, compositions, and the real verification pass

**Files:**
- Create: `apps/ios/Loggi/Gallery/GalleryView.swift`
- Create: `apps/ios/Loggi/Gallery/GalleryCompositions.swift`
- Modify: `apps/ios/Loggi/Navigation/Route.swift` (add `.gallery`)
- Modify: `apps/ios/Loggi/Navigation/RootView.swift` (DEBUG-only gallery presentation)

**Interfaces:**
- Consumes: every component from Tasks 3–6, `Theme2` (Task 1), `Route` (existing).
- Produces: `GalleryView`, `PopulatedComposition`, `EmptyComposition`. Nothing later depends on these.

- [ ] **Step 1: Add the `.gallery` route**

In `apps/ios/Loggi/Navigation/Route.swift`, add `case gallery` to the enum (alongside `askBevi`, `menuScout`, …) and add this case to `parse`'s switch, immediately before `default`:

```swift
        case "gallery": return .gallery
```

- [ ] **Step 2: Write `GalleryCompositions.swift`**

```swift
#if DEBUG
import SwiftUI

/// A realistic populated screen. The gallery exists to answer "does the system
/// hold together on a real screen", which a component grid cannot show.
struct PopulatedComposition: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme2.Space.l) {
                VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                    Text("Today").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                    Text("Good afternoon").font(Theme2.Text.title).foregroundStyle(Theme2.ink)
                }
                SurfaceCard {
                    VStack(spacing: Theme2.Space.l) {
                        CalorieRing(consumed: 1030, goal: 1950)
                        VStack(spacing: Theme2.Space.m) {
                            MacroBar(macro: .protein, grams: 40, goal: 150)
                            MacroBar(macro: .carbs, grams: 60, goal: 200)
                            MacroBar(macro: .fat, grams: 20, goal: 65)
                        }
                    }
                }
                SurfaceCard {
                    VStack(alignment: .leading, spacing: Theme2.Space.m) {
                        Text("Last 7 days").font(Theme2.Text.label).foregroundStyle(Theme2.ink)
                        CalorieChart(days: GalleryData.week, goal: 1950)
                    }
                }
            }
            .padding(Theme2.Space.l)
        }
        .background(Theme2.canvas)
    }
}

/// The empty screen — spec §9.1's risk surface. This is the composition to
/// judge first: it must read as calm and inviting, NOT blank and cold.
struct EmptyComposition: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme2.Space.l) {
                VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                    Text("Today").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                    Text("Good morning").font(Theme2.Text.title).foregroundStyle(Theme2.ink)
                }
                SurfaceCard {
                    VStack(spacing: Theme2.Space.l) {
                        CalorieRing(consumed: 0, goal: 1950)
                        VStack(spacing: Theme2.Space.m) {
                            MacroBar(macro: .protein, grams: 0, goal: 150)
                            MacroBar(macro: .carbs, grams: 0, goal: 200)
                            MacroBar(macro: .fat, grams: 0, goal: 65)
                        }
                    }
                }
                SurfaceCard {
                    EmptyStateView(
                        title: "Nothing logged yet",
                        message: "Snap a photo of your next meal and it'll show up here.",
                        systemImage: "camera")
                }
            }
            .padding(Theme2.Space.l)
        }
        .background(Theme2.canvas)
    }
}

enum GalleryData {
    static let week: [CalorieChart.Day] = [
        .init(date: "Mon 14 Jul", label: "M", calories: 1820),
        .init(date: "Tue 15 Jul", label: "T", calories: 1640),
        .init(date: "Wed 16 Jul", label: "W", calories: 2240),
        .init(date: "Thu 17 Jul", label: "T", calories: 1910),
        .init(date: "Fri 18 Jul", label: "F", calories: 2480),
        .init(date: "Sat 19 Jul", label: "S", calories: 1750),
        .init(date: "Sun 20 Jul", label: "S", calories: 1030),
    ]
}
#endif
```

- [ ] **Step 3: Write `GalleryView.swift`**

```swift
#if DEBUG
import SwiftUI

/// DEBUG-only component gallery — the review surface for the visual system
/// and the screenshot target for the compliance sweep. Reachable via
/// `loggi://gallery` or `-route gallery`.
///
/// Wrapped in `#if DEBUG` in full: this must never ship in a release build.
struct GalleryView: View {
    private enum Tab: String, CaseIterable, Identifiable {
        case components = "Components"
        case populated = "Populated"
        case empty = "Empty"
        var id: String { rawValue }
    }
    @State private var tab: Tab = .components

    var body: some View {
        VStack(spacing: 0) {
            Picker("View", selection: $tab) {
                ForEach(Tab.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(Theme2.Space.l)
            .background(Theme2.canvas)

            switch tab {
            case .components: componentList
            case .populated: PopulatedComposition()
            case .empty: EmptyComposition()
            }
        }
        .background(Theme2.canvas)
    }

    private var componentList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme2.Space.xl) {
                section("Status — colour + symbol + text") {
                    VStack(alignment: .leading, spacing: Theme2.Space.m) {
                        StatusBadge(status: .onTarget)
                        StatusBadge(status: .over)
                        StatusBadge(status: .over, text: "120 over")
                    }
                }
                section("Macro ramp — protein darkest to fat lightest") {
                    VStack(spacing: Theme2.Space.m) {
                        MacroBar(macro: .protein, grams: 40, goal: 150)
                        MacroBar(macro: .carbs, grams: 60, goal: 200)
                        MacroBar(macro: .fat, grams: 20, goal: 65)
                    }
                }
                section("Calorie ring — under and over") {
                    HStack(spacing: Theme2.Space.l) {
                        CalorieRing(consumed: 1030, goal: 1950)
                        CalorieRing(consumed: 2180, goal: 1950)
                    }
                }
                section("Chart") {
                    CalorieChart(days: GalleryData.week, goal: 1950)
                }
                section("Empty state") {
                    EmptyStateView(
                        title: "Nothing logged yet",
                        message: "Snap a photo of your next meal and it'll show up here.",
                        systemImage: "camera")
                }
            }
            .padding(Theme2.Space.l)
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Theme2.Space.m) {
            Text(title.uppercased())
                .font(Theme2.Text.caption)
                .foregroundStyle(Theme2.inkSecondary)
            SurfaceCard { content() }
        }
    }
}
#endif
```

- [ ] **Step 4: Present the gallery from `RootView`**

In `apps/ios/Loggi/Navigation/RootView.swift`, add this modifier to the existing `TabView` (do NOT restructure the tab shell, and do NOT add a tab for it):

```swift
        #if DEBUG
        .fullScreenCover(isPresented: .constant(route == .gallery)) {
            GalleryView()
        }
        #endif
```

Note for implementer: `RootView`'s `selection` binding maps unknown routes to `.today` via `default: return .today` (verified at `RootView.swift:33`), so adding `.gallery` to `Route` needs no change there — but re-read it before trusting this, since Task 7 may not run immediately after this plan was written.

`.constant(...)` makes the cover non-dismissable, which is fine for a screenshot target driven by `-route gallery` but poor if you want to poke at it by hand. A `@State` mirror seeded from `route` is the better option if you plan to interact with it; say which you used in the report.

- [ ] **Step 5: Regenerate, build, and screenshot every surface**

```bash
cd apps/ios && xcodegen generate
UDID=$(xcrun simctl list devices booted | grep iPhone | sed -n 's/.*(\([A-F0-9-]\{36\}\)) (Booted).*/\1/p' | head -1)
[[ -n "$UDID" ]] || { echo "No booted iPhone sim"; exit 1; }
bash scripts/dev-loop.sh /tmp/gallery-components.png gallery
```

Then capture, at minimum, these named artifacts under `.superpowers/sdd/`:
- `gallery-components-light.png`, `gallery-components-dark.png`
- `gallery-populated-light.png`, `gallery-populated-dark.png`
- `gallery-empty-light.png`, `gallery-empty-dark.png`
- `gallery-empty-ax5.png` (largest accessibility text size)

Switch appearance with:
```bash
xcrun simctl ui "$UDID" appearance dark   # and: light
```
Set the largest Dynamic Type size with:
```bash
xcrun simctl ui "$UDID" content_size accessibility-extra-extra-extra-large
```

Tab switching inside the gallery needs a tap, and **tap automation is unavailable in this environment** (`simctl` has no synthetic-tap verb; the installed `idb` is broken under Python 3.14). Work around it by temporarily changing `GalleryView`'s `@State private var tab` default to `.populated` / `.empty`, rebuilding for each capture, and reverting to `.components` before commit. Confirm the revert with `git diff` and say so in the report.

- [ ] **Step 6: Check what the screenshots actually show**

View each screenshot and confirm, explicitly, in the task report:
1. The chart renders **real bars** with visible axis labels — not an empty plot area (Charts fails silently at runtime, and `BUILD SUCCEEDED` proves nothing here).
2. Over-target bars are visibly distinct from on-target ones AND the goal rule is visible.
3. The macro ramp reads as three distinguishable steps in both themes.
4. Nothing is pure white or pure black — the canvas is visibly warm.
5. At AX5, no text is clipped and the ring's numeral still fits.
6. **The empty composition reads as calm and inviting rather than blank.** This is the spec's headline risk. If it reads as cold or sparse, say so plainly in the report rather than reporting success — that finding is the single most valuable output of this task, and a later task can act on it.

- [ ] **Step 7: Run the palette tests once more**

```bash
xcodebuild test -project Loggi.xcodeproj -scheme Loggi -destination "id=$UDID" -only-testing:LoggiTests 2>&1 | tail -20
```
Expected: 5 tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Loggi/Gallery apps/ios/Loggi/Navigation/Route.swift apps/ios/Loggi/Navigation/RootView.swift
git commit -m "design-system: DEBUG-only component gallery with populated + empty compositions"
```

---

### Task 8: Rewrite DESIGN.md's superseded sections

**Files:**
- Modify: `DESIGN.md` (§2.1, §2.2, §2.3, §2.5, §2.6, §5)

Do this only after Task 7's screenshots confirm the system renders correctly. DESIGN.md is binding per AGENTS.md, so it must describe what actually exists, not what was planned.

- [ ] **Step 1: Rewrite the superseded sections**

Per spec §8, rewrite in place:
- **§2.1 art direction** — replace "flat + stark, no gradients, no drop shadows" with the native-surface direction: warm canvas, raised surfaces, hierarchy from ground/type/space. Keep the vermilion accent-discipline paragraph verbatim and keep the Bevi paragraph verbatim.
- **§2.2 palette** — replace the whole token table with the colour-as-data map from spec §3.0/§3.1/§3.3/§3.4, including the exact hexes from this plan's Global Constraints, the "fat is graphic-only" rule, and the "colour is never the only signal" rule.
- **§2.3 typography** — replace the fixed scale with the Dynamic Type approach from spec §4 and the `Theme2.Text` token names.
- **§2.5 shape & radius / §2.6 elevation** — replace with `Theme2.Radius` values and the warm-surface-plus-hairline treatment.
- **§5 accessibility baseline** — keep every existing bullet, and ADD: the mandated non-colour channel for status (spec §3.3a), and that data colours are validated against both canvas and raised surface.

Leave untouched: §1, §1.1, §2.4, §2.7, §2.8, §2.9, §3, §4.

- [ ] **Step 2: Add the deliberate-divergence note**

At the top of §2, add:

```markdown
> **Two systems currently coexist.** The four tab screens (Today, History,
> Weight, Settings) still render the legacy `Theme` tokens from the RN port;
> everything described below is the `Theme2` system, live in the DEBUG-only
> gallery (`loggi://gallery`) and used by all new work. The screens are
> rebuilt against it in a later phase. This divergence is expected, not drift.
```

- [ ] **Step 3: Verify no stale references remain**

```bash
grep -n "pastel\|block-lime\|blockLime\|text-6xl\|60px\|no drop shadows" DESIGN.md
```
Expected: hits only inside §4 screen specs (which still describe the legacy screens) or the coexistence note. Any hit in §2 means a section was missed.

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md
git commit -m "docs: DESIGN.md §2 rewritten for the Swift-native visual system"
```

---

## Self-review notes

- **Spec coverage:** §2/§2.1 organizing principle + warmth → Task 1 tokens, Task 6 empty state, Task 7 compositions. §3.0 two-ground validation → Task 1 values, Task 2 test. §3.1 macro ramp → Task 1, Task 4 `MacroBar`, Task 2 lightness test. §3.2 "approaching is not a colour" → enforced by omission: `GoalStatus` has exactly two cases, so there is no token to misuse. §3.3 status + mandated non-colour channel → Task 3 `StatusBadge`, Task 5 per-bar labels, Task 2's assertion. §3.4 vermilion reserved → Task 1, Task 2 test. §4 Dynamic Type → Task 1 `Theme2.Text`, verified at AX5 in Task 7. §5 components → Tasks 3–6. §6 gallery incl. empty composition → Task 7. §8 DESIGN.md rewrite → Task 8. §9.1 risk → Task 7 Step 6.6 makes it an explicit reporting obligation.
- **Deliberately out of scope** (spec §7): the four Phase 2 screens are untouched; `.refreshable`/`NavigationStack`/`.searchable`/`.sensoryFeedback` land when screens are rebuilt, since there is no screen here to attach them to.
- **Known substitution:** Task 6 uses SF Symbols rather than Bevi, because Bevi's PNG poses are tuned to the old pastel grounds. Spec §1 keeps Bevi as an identity carrier, so re-tuning is a follow-up task — called out in the component's own doc comment so it can't be silently forgotten.
- **Type consistency:** `Theme2.Space` uses `xs/s/m/l/xl` (note: no `cluster`, unlike legacy `Theme.Spacing`) and is used consistently in Tasks 3–7. `GoalStatus` (Task 3) is consumed by Task 5. `Macro` (Task 4) is used only within Task 4 and Task 7. `CalorieChart.Day` (Task 5) is constructed in Task 7's `GalleryData`. `Theme2.Text.figure` is defined in Task 1 but not consumed by any task — it is retained deliberately for the screen-rebuild phase; if a reviewer prefers strict YAGNI, deleting it is safe.
- **Verification honesty:** Task 7 Step 6 requires stating what the screenshots show rather than that they were taken. Phase 0 and Phase 2 of this project both had tasks that narrated verification without artifacts; the named-file list and the explicit "say so plainly if it reads cold" instruction exist to prevent a repeat.
