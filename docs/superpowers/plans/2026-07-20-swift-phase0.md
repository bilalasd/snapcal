# Swift Rewrite Phase 0 — Skeleton + Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A SwiftUI app at `apps/ios/` that boots on the simulator to themed placeholder screens, navigates via `loggi://` deep links, embeds the existing widget/App-Intents targets, and works with the established simctl screenshot loop.

**Architecture:** XcodeGen-generated project (`project.yml` is the source of truth; `Loggi.xcodeproj` is generated, gitignored). One app target + two extension targets (sources copied from `apps/mobile/targets/`). Theme is programmatic dynamic colors (single Swift file, no asset-catalog color sets); Bevi PNGs go in an asset catalog. No third-party dependencies in Phase 0.

**Tech Stack:** Swift 6 / SwiftUI, iOS 17.0 floor, XcodeGen, simctl for verification.

## Global Constraints

- Work in this worktree: `/Users/muhammadbalagamwala/Documents/Projects/2026/SnapCal/.claude/worktrees/swift-rewrite`. All paths below relative to it.
- Bundle ids: app `com.loggi.app`, widgets `com.loggi.app.widget`, intents `com.loggi.app.appintents`; app group `group.com.loggi.app`; team `L8GMK24E8Q`. Deployment target `17.0` (extensions may keep higher floors — see Task 4).
- Installing on a simulator replaces any RN-built Loggi on that sim — expected; never install Phase 0 builds on a physical phone.
- Simulator: use the currently booted device (`xcrun simctl list devices booted`); build with destination `platform=iOS Simulator,id=<that UDID>`.
- DESIGN.md is binding for all visual values; the exact token hexes are embedded in Task 2 (verified against `tailwind.config.js` + `global.css` on 2026-07-20).
- Commit after each task with the message given; trailers:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01LUkoTB1GUfXibmxxhrVQdh`.

---

### Task 1: XcodeGen scaffold that boots

**Files:**
- Create: `apps/ios/project.yml`
- Create: `apps/ios/Loggi/LoggiApp.swift`
- Create: `apps/ios/Loggi/Info.plist`
- Modify: `.gitignore` (repo root — add generated project)

**Interfaces:**
- Produces: `apps/ios/` layout, `xcodegen generate` → `Loggi.xcodeproj`, app boots to a placeholder Text view. Task 2 replaces the placeholder body; Task 3 adds URL types to `project.yml`'s `info` properties.

- [ ] **Step 1: Install XcodeGen if missing**

Run: `which xcodegen || brew install xcodegen`
Expected: a path to xcodegen (install may take a few minutes).

- [ ] **Step 2: Write `apps/ios/project.yml`**

```yaml
name: Loggi
options:
  bundleIdPrefix: com.loggi
  deploymentTarget:
    iOS: "17.0"
  createIntermediateGroups: true
settings:
  base:
    DEVELOPMENT_TEAM: L8GMK24E8Q
    SWIFT_VERSION: "6.0"
    CURRENT_PROJECT_VERSION: 1
    MARKETING_VERSION: 0.1.0
targets:
  Loggi:
    type: application
    platform: iOS
    sources: [Loggi]
    info:
      path: Loggi/Info.plist
      properties:
        CFBundleDisplayName: Loggi
        UILaunchScreen: {}
        UISupportedInterfaceOrientations: [UIInterfaceOrientationPortrait]
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.loggi.app
        TARGETED_DEVICE_FAMILY: "1"
```

- [ ] **Step 3: Write `apps/ios/Loggi/LoggiApp.swift`**

```swift
import SwiftUI

@main
struct LoggiApp: App {
    var body: some Scene {
        WindowGroup {
            Text("Loggi — Swift skeleton")
        }
    }
}
```

- [ ] **Step 4: Generate, build, install, launch**

```bash
cd apps/ios && xcodegen generate
UDID=$(xcrun simctl list devices booted | grep -oE '[0-9A-F-]{36}' | head -1)
xcodebuild -project Loggi.xcodeproj -scheme Loggi -configuration Debug \
  -destination "platform=iOS Simulator,id=$UDID" build | tail -1
APP=$(ls -td ~/Library/Developer/Xcode/DerivedData/Loggi-*/Build/Products/Debug-iphonesimulator/Loggi.app | head -1)
xcrun simctl uninstall booted com.loggi.app; xcrun simctl install booted "$APP"
xcrun simctl launch booted com.loggi.app
```
Expected: `** BUILD SUCCEEDED **`, then a PID. Screenshot via `xcrun simctl io booted screenshot /tmp/phase0-t1.png` and confirm the placeholder text renders.

- [ ] **Step 5: Gitignore the generated project and commit**

Append to repo-root `.gitignore`:
```
apps/ios/Loggi.xcodeproj
```
```bash
git add .gitignore apps/ios
git commit -m "swift: Phase 0 scaffold — XcodeGen project boots to placeholder"
```

---

### Task 2: Theme (tokens as Swift) + Bevi assets

**Files:**
- Create: `apps/ios/Loggi/Theme/Theme.swift`
- Create: `apps/ios/Loggi/Assets.xcassets` (Bevi images + AppIcon placeholder)
- Modify: `apps/ios/Loggi/LoggiApp.swift` (themed placeholder proving tokens)

**Interfaces:**
- Produces: `Theme.color(_:)` / `Color` extensions (`Color.background`, `.foreground`, `.card`, `.primaryFill`, `.primaryText`, `.muted`, `.mutedForeground`, `.accentQuiet`, `.destructive`, `.warning`, `.hairline`, `.accentLog`, `.blockLime`, `.blockLilac`, `.blockCream`, `.blockMint`, `.blockCoral`), `Theme.Typography` (`.headline34`, `.kicker12`, `.body16`, `.caption11`), `Theme.Spacing` (4/8 rhythm), `Theme.Motion.standard` (130ms ease-out). All later phases consume these names.

- [ ] **Step 1: Write `Theme.swift`** — dynamic light/dark via UIColor closure; values are DESIGN.md §2.2 verbatim:

```swift
import SwiftUI
import UIKit

enum Theme {
    /// Dynamic color: light/dark authored independently per DESIGN.md §2.2.
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

    // Semantic (light, dark)
    static let background      = dynamic(0xFFFFFF, 0x0C0C0C)
    static let foreground      = dynamic(0x000000, 0xF5F5F5)
    static let card            = dynamic(0xFFFFFF, 0x161616)
    static let primaryFill     = dynamic(0x000000, 0xF5F5F5)
    static let primaryText     = dynamic(0xFFFFFF, 0x0C0C0C)
    static let muted           = dynamic(0xF7F7F5, 0x1C1C1A)
    static let mutedForeground = dynamic(0x565656, 0xA3A3A3)
    static let accentQuiet     = dynamic(0xF1F1F1, 0x222222)
    static let destructive     = dynamic(0xD92D20, 0xF97066)
    static let warning         = dynamic(0xB45309, 0xD97706)
    static let hairline        = dynamic(0xE6E6E6, 0x2A2A2A)

    // Fixed across themes (DESIGN.md: accent-log + pastel blocks keep black ink)
    static let accentLog   = fixed(0xE64A19)
    static let blockLime   = fixed(0xDCEEB1)
    static let blockLilac  = fixed(0xC5B0F4)
    static let blockCream  = fixed(0xF4ECD6)
    static let blockMint   = fixed(0xC8E6CD)
    static let blockCoral  = fixed(0xF3C9B6)

    enum Typography {
        static let headline34 = Font.system(size: 34, weight: .black).width(.standard)
        static let kicker12   = Font.system(size: 12, weight: .heavy)
        static let body16     = Font.system(size: 16, weight: .regular)
        static let caption11  = Font.system(size: 11, weight: .semibold) // 11px floor per DESIGN.md
    }
    enum Spacing {
        static let xs: CGFloat = 4, s: CGFloat = 8, m: CGFloat = 16, l: CGFloat = 20, xl: CGFloat = 24
    }
    enum Motion {
        static let standard = Animation.timingCurve(0.0, 0.0, 0.58, 1.0, duration: 0.13) // 130ms ease-out
    }
}
```

Note for the implementer: the dark `hairline` value `0x2A2A2A` is not in the DESIGN.md excerpt — read `apps/mobile/global.css` `.dark { --border: ... }` and use that exact value; if it differs from `0x2A2A2A`, use the CSS value and say so in your report.

- [ ] **Step 2: Copy Bevi assets** — create `Assets.xcassets` with one imageset per pose from `apps/mobile/assets/bevi/*.png` (standing, wave, clipboard, camera, scale, promise, celebrate; also check the directory for any extra poses and include them). Each imageset: the PNG as universal 1x, `preserves-vector-representation: false`. Script it (imageset = folder + `Contents.json`).

- [ ] **Step 3: Themed placeholder** — replace `LoggiApp` body with a proof-of-theme view:

```swift
WindowGroup {
    VStack(alignment: .leading, spacing: Theme.Spacing.m) {
        Text("PLAN DESK").font(Theme.Typography.kicker12)
            .foregroundStyle(Theme.mutedForeground).kerning(2)
        Text("Loggi").font(Theme.Typography.headline34)
            .foregroundStyle(Theme.foreground)
        HStack(spacing: Theme.Spacing.s) {
            ForEach([Theme.blockLime, Theme.blockLilac, Theme.blockCream,
                     Theme.blockMint, Theme.blockCoral, Theme.accentLog],
                    id: \.self) { c in
                RoundedRectangle(cornerRadius: 8).fill(c).frame(width: 40, height: 40)
            }
        }
        Image("bevi-standing").resizable().scaledToFit().frame(height: 160)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(Theme.Spacing.l)
    .background(Theme.background)
}
```

- [ ] **Step 4: Build, install, launch; screenshot light AND dark** (`xcrun simctl ui booted appearance dark`, screenshot, back to light). Verify: tokens render, Bevi shows, dark mode is the authored near-black (not inverted).

- [ ] **Step 5: Commit** — `swift: theme tokens + Bevi assets (DESIGN.md §2 port)`

---

### Task 3: `loggi://` deep links + route placeholders

**Files:**
- Create: `apps/ios/Loggi/Navigation/Route.swift`
- Create: `apps/ios/Loggi/Navigation/RootView.swift`
- Modify: `apps/ios/project.yml` (URL scheme), `apps/ios/Loggi/LoggiApp.swift`

**Interfaces:**
- Produces: `enum Route` with `parse(url: URL) -> Route?` covering: `today` (empty path or `/`), `history`, `weight`, `settings`, `add` (params `intent: String?` ∈ camera|speak|search|saved, `date: String?`), `ask-bevi`, `menu-scout`, `onboarding`, `paywall`, `sign-in`, `sign-up`, `reset-password`, `welcome`. `RootView` shows a themed placeholder per route (route name as headline + kicker "PHASE 0 PLACEHOLDER" + params echoed). Later phases replace placeholder bodies; the enum and parser survive.

- [ ] **Step 1: Add URL scheme to `project.yml`** under the Loggi target's `info.properties`:

```yaml
        CFBundleURLTypes:
          - CFBundleURLName: com.loggi.app
            CFBundleURLSchemes: [loggi]
```

- [ ] **Step 2: Write `Route.swift`**

```swift
import Foundation

enum Route: Equatable {
    case today, history, weight, settings
    case add(intent: String?, date: String?)
    case askBevi, menuScout, onboarding, paywall
    case signIn, signUp, resetPassword, welcome

    /// loggi://<path>?<query> — mirrors the expo-router URLs in docs/screenshots.md
    static func parse(_ url: URL) -> Route? {
        guard url.scheme == "loggi" else { return nil }
        // loggi://history parses host="history"; loggi:///history parses path.
        let name = url.host ?? url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func q(_ key: String) -> String? { query.first { $0.name == key }?.value }
        switch name {
        case "", "today": return .today
        case "history": return .history
        case "weight": return .weight
        case "settings": return .settings
        case "add": return .add(intent: q("intent"), date: q("date"))
        case "ask-bevi": return .askBevi
        case "menu-scout": return .menuScout
        case "onboarding": return .onboarding
        case "paywall": return .paywall
        case "sign-in": return .signIn
        case "sign-up": return .signUp
        case "reset-password": return .resetPassword
        case "welcome": return .welcome
        default: return nil
        }
    }
}
```

- [ ] **Step 3: Write `RootView.swift`** — `@State private var route: Route = .today`; body renders the themed placeholder (headline = route label, echo `add` params in a caption); attach `.onOpenURL { if let r = Route.parse($0) { route = r } }` at the WindowGroup level in `LoggiApp`.

- [ ] **Step 4: Test parser edge cases with a tiny XCTest-free assert script** — add `apps/ios/Loggi/Navigation/RouteTests.swift` guarded by `#if DEBUG`, a `static func runAssertions()` called from `LoggiApp.init` in DEBUG only:

```swift
#if DEBUG
enum RouteTests {
    static func runAssertions() {
        assert(Route.parse(URL(string: "loggi://history")!) == .history)
        assert(Route.parse(URL(string: "loggi://add?intent=speak")!) == .add(intent: "speak", date: nil))
        assert(Route.parse(URL(string: "loggi://add?intent=search&date=2026-07-20")!) == .add(intent: "search", date: "2026-07-20"))
        assert(Route.parse(URL(string: "loggi://")!) == .today)
        assert(Route.parse(URL(string: "https://history")!) == nil)
    }
}
#endif
```

- [ ] **Step 5: Rebuild, install, verify by driving the deep links** exactly like the RN loop:

```bash
for r in history weight settings "add?intent=speak" ask-bevi menu-scout onboarding paywall sign-in; do
  xcrun simctl openurl booted "loggi://$r"; sleep 1
  xcrun simctl io booted screenshot "/tmp/phase0-$r.png"
done
```
Expected: each screenshot shows the matching route placeholder (view a few to confirm; `add` shows `intent=speak`).

- [ ] **Step 6: Commit** — `swift: loggi:// deep-link router + route placeholders`

---

### Task 4: Widgets + App Intents extension targets

**Files:**
- Create: `apps/ios/LoggiWidgets/` (copy `apps/mobile/targets/widgets/Widgets.swift`; new `Info.plist` from the existing one)
- Create: `apps/ios/LoggiIntents/` (copy `apps/mobile/targets/app-intents/LoggiIntents.swift`; `Info.plist` likewise)
- Create: `apps/ios/Loggi/Loggi.entitlements`, `apps/ios/LoggiWidgets/LoggiWidgets.entitlements` (app group `group.com.loggi.app`, mirroring `apps/mobile/targets/widgets/generated.entitlements`)
- Modify: `apps/ios/project.yml`

**Interfaces:**
- Consumes: Theme (widgets may reference their own colors — keep their existing code unmodified where possible).
- Produces: `Loggi.app/PlugIns/LoggiWidgets.appex` and `Extensions/LoggiIntents.appex` in every build; the same widget/intents behavior the RN app ships (they read the shared app-group store — empty in Phase 0, placeholder states are expected).

- [ ] **Step 1: Copy sources verbatim**, then read both Swift files and their old `Info.plist`/`expo-target.config.js` to extract: extension point identifiers (widgets: `com.apple.widgetkit-extension`; intents: the ExtensionKit `EXAppExtensionAttributes` identifier from the existing Info.plist), deployment targets, and any bundle-display names. Preserve those values exactly.

- [ ] **Step 2: Add both targets to `project.yml`** — `LoggiWidgets` as `app-extension` (widgetkit), `LoggiIntents` as `extensionkit-extension` (XcodeGen `type: extensionkit-extension`; if unsupported by installed XcodeGen version, fall back to `app-extension` with `EXAppExtensionAttributes` in Info and report the deviation). Embed both in the app target (`dependencies: [{target: LoggiWidgets, embed: true}, {target: LoggiIntents, embed: true}]`). Attach entitlements files; bundle ids per Global Constraints; deployment targets: whatever the originals declare (17.0/18.0 per the RN pbxproj — read and match).

- [ ] **Step 3: Build; if widget code imports the RN `widget-bridge` module**, check imports in `Widgets.swift`/`LoggiIntents.swift`: if they reference the `widget-bridge` local expo module or anything non-stdlib, replace only the data-reading shim with a minimal `SharedStore.swift` (UserDefaults(suiteName: "group.com.loggi.app") reads, same keys — copy key names from the existing code) and report exactly what was shimmed.

- [ ] **Step 4: Verify** both appexes in build products:

```bash
APP=$(ls -td ~/Library/Developer/Xcode/DerivedData/Loggi-*/Build/Products/Debug-iphonesimulator/Loggi.app | head -1)
ls "$APP/PlugIns" "$APP/Extensions" 2>/dev/null
```
Expected: `LoggiWidgets.appex` and `LoggiIntents.appex`. Install + launch the app; no crash.

- [ ] **Step 5: Commit** — `swift: widget + app-intents targets ported into XcodeGen project`

---

### Task 5: Screenshot loop for the Swift app

**Files:**
- Modify: `docs/screenshots.md` (add a "Swift app (apps/ios)" section)
- Create: `apps/ios/scripts/dev-loop.sh`

**Interfaces:**
- Consumes: Tasks 1–4. Produces the verify workflow every later phase uses.

- [ ] **Step 1: Write `apps/ios/scripts/dev-loop.sh`** — one command that regenerates (xcodegen), builds, installs to the booted sim, launches, waits 2s, and screenshots to a path argument. `set -euo pipefail`; usage: `dev-loop.sh [screenshot-path]`.

- [ ] **Step 2: Add to `docs/screenshots.md`** a short Swift section: build via `dev-loop.sh`, deep links identical to the RN table, no Metro, no permission pre-grants needed until Phase 3 (camera/speech), same dark-mode command.

- [ ] **Step 3: Full sweep proof** — run the Task 3 Step 5 loop plus dark-mode variant of `today`; confirm all screenshots render themed placeholders.

- [ ] **Step 4: Commit** — `swift: dev screenshot loop (script + docs)`

---

## Self-review notes

- Spec coverage (Phase 0 = "XcodeGen project, app + widget/intents targets wired, theme, Bevi, deep links, screenshot loop works, boots to themed placeholder"): T1 project+boot, T2 theme+Bevi, T3 deep links, T4 extensions, T5 loop. Complete.
- Route list cross-checked against `apps/mobile/app/` routes + paywall (added post-merge) + auth group.
- Token hexes copied from DESIGN.md §2.2 and `tailwind.config.js` (accent-log #e64a19, blocks lime/lilac/cream/mint/coral, dark palette authored-not-inverted); one value (dark border) flagged for the implementer to verify against global.css rather than guessed.
- Deliberately absent (YAGNI for Phase 0): tab bar, real screens, API calls, GRDB, Clerk — Phase 1+.
