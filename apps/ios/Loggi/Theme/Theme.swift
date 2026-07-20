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
        // DESIGN.md §2.3: "text-4xl font-black tracking-tighter" = 36px/black.
        static let headline36 = Font.system(size: 36, weight: .black).width(.standard)
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
