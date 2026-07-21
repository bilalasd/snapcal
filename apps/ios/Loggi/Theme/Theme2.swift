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
    static let statusOver     = dynamic(0xA5003C, 0xF5829B)

    // MARK: - Pastel block surfaces (spec §3.5). SURFACES, not data — the
    // same reasoning that warms the canvas: personality lives in the ground,
    // and the ground carries no meaning. Fixed across themes (they do not
    // invert), so anything drawn on them uses `blockInk`, never a dynamic
    // token that would flip to near-white in dark mode.
    //
    // Validated: `blockInk` clears 9.3:1 (lilac, the darkest) to 15.3:1
    // (cream). Macro bars must NOT be placed on these — fat is 1.8-2.9:1 on
    // four of five, and no fat value exists that clears all five while
    // remaining a distinct ramp step. Use `PastelCard`, which enforces this.
    enum Block {
        static let lime  = fixed(0xDCEEB1)
        static let lilac = fixed(0xC5B0F4)
        static let cream = fixed(0xF4ECD6)
        static let mint  = fixed(0xC8E6CD)
        static let coral = fixed(0xF3C9B6)
    }
    /// Fixed ink for pastel surfaces. Never `Theme2.ink` — that inverts.
    static let blockInk          = fixed(0x1A1613)
    static let blockInkSecondary = fixed(0x5C5349)

    // MARK: - Type (spec §4). Dynamic Type only — but Dynamic Type means
    // text SCALES, not that it is small. `.custom(_:relativeTo:)` keeps the
    // display weight and scales correctly; conflating the two is what made
    // the first pass read as generic.
    enum Text {
        static let hero    = Font.system(.largeTitle, design: .rounded, weight: .bold).monospacedDigit()
        static let title   = Font.system(.title2, design: .rounded, weight: .semibold)
        static let body    = Font.system(.body)
        static let label   = Font.system(.subheadline, weight: .medium)
        static let caption = Font.system(.caption, weight: .medium)
        /// Figures that must align in columns; scales with Dynamic Type.
        static let figure  = Font.system(.title3, design: .rounded, weight: .semibold).monospacedDigit()
        /// The hero numeral — DESIGN.md's 60px black display figure, restored.
        /// `relativeTo:` is what keeps this Dynamic-Type compliant: it scales
        /// with the user's setting instead of being a frozen 60pt.
        static let display60 = Font.custom("SF Pro Rounded", size: 60, relativeTo: .largeTitle)
            .weight(.black).monospacedDigit()
        /// Screen titles — 36px black (DESIGN.md §2.3 "Headline").
        static let headline36 = Font.custom("SF Pro Rounded", size: 36, relativeTo: .title)
            .weight(.black)
        /// Uppercase eyebrow above a headline.
        static let kicker = Font.system(.caption, weight: .heavy)
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
