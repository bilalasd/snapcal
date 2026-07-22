import SwiftUI
import UIKit

/// Design tokens for the app — the **original React Native design language**
/// (DESIGN.md §2): stark white / near-black editorial, one loud vermilion
/// accent reserved for logging, heavy black display type, flat white cards with
/// hairline borders, pastel block tiles with near-black ink.
///
/// (A Swift-native "colour-as-data / warm canvas" experiment was tried here and
/// rejected — these values revert to the RN look. The API surface is unchanged
/// so screens didn't need editing; only the token values moved.)
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

    // MARK: - Ground & surfaces (RN: stark white canvas, flat white cards).
    static let canvas  = dynamic(0xFFFFFF, 0x0C0C0C)
    /// The flat white card (hairline-bordered) — RN `bg-card`, not a warm tint.
    static let surface = dynamic(0xFFFFFF, 0x161616)
    static let ink          = dynamic(0x000000, 0xF5F5F5)
    static let inkSecondary = dynamic(0x565656, 0xA3A3A3)
    static let hairline     = dynamic(0xE6E6E6, 0x2A2A2A)

    // MARK: - Reserved accent. "Log something" only — never chrome/decoration.
    static let accentLog = fixed(0xE64A19)

    // MARK: - Macro bars (RN `MACRO_INK`): foreground / 70% / 50% ink, so they
    // track the theme (black on white, off-white on dark). Not a colour ramp.
    static let macroProtein = dynamic(0x000000, 0xF5F5F5)
    static let macroCarbs   = macroProtein.opacity(0.7)
    static let macroFat     = macroProtein.opacity(0.5)

    // MARK: - Status: "on target" is just ink, destructive red for over — the
    // RN semantic. Always paired with a symbol/label at the use site.
    static let statusOnTarget = dynamic(0x000000, 0xF5F5F5)
    static let statusOver     = dynamic(0xD92D20, 0xF97066)

    // MARK: - Pastel block tiles (fixed across themes; near-black ink).
    enum Block {
        static let lime  = fixed(0xDCEEB1)
        static let lilac = fixed(0xC5B0F4)
        static let cream = fixed(0xF4ECD6)
        static let mint  = fixed(0xC8E6CD)
        static let coral = fixed(0xF3C9B6)
    }
    /// Fixed black ink for pastel surfaces (RN `text-black`) — pastels don't
    /// invert with the theme, so their ink can't either.
    static let blockInk          = fixed(0x000000)
    static let blockInkSecondary = Color.black.opacity(0.6)

    // MARK: - Type (RN: system font, heavy black weights, tabular figures,
    // fixed editorial sizes — DESIGN.md §2.3's NativeWind scale).
    enum Text {
        /// Big metric — "text-6xl font-black" tabular = 60px.
        static let display60 = Font.system(size: 60, weight: .black).monospacedDigit()
        /// Screen title — "text-4xl font-black" = 36px.
        static let headline36 = Font.system(size: 36, weight: .black)
        /// Ring-center figure.
        static let hero    = Font.system(size: 44, weight: .black).monospacedDigit()
        /// Card title — "text-2xl font-black".
        static let title   = Font.system(size: 22, weight: .black)
        /// Desk eyebrow — "text-xs font-extrabold uppercase" (uppercased at use).
        static let kicker  = Font.system(size: 12, weight: .heavy)
        static let body    = Font.system(size: 16, weight: .regular)
        static let label   = Font.system(size: 15, weight: .semibold)
        static let caption = Font.system(size: 11, weight: .semibold) // 11px HIG floor
        /// Aligned data figures.
        static let figure  = Font.system(size: 17, weight: .bold).monospacedDigit()
    }

    enum Space {
        static let xs: CGFloat = 4, s: CGFloat = 8, m: CGFloat = 12, l: CGFloat = 16, xl: CGFloat = 24
    }
    enum Radius {
        /// RN cards `rounded-3xl` (24), inputs/rows `rounded-2xl` (16).
        static let card: CGFloat = 24, control: CGFloat = 16
    }
    enum Motion {
        /// 130ms ease-out, no springs (DESIGN.md §2.8).
        static let standard = Animation.timingCurve(0.0, 0.0, 0.58, 1.0, duration: 0.13)
    }
}
