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
