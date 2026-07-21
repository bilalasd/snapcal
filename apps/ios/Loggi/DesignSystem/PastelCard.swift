import SwiftUI

/// A pastel block card — Loggi's expressive surface (DESIGN.md §2.2's block
/// tokens, restored). This is a SURFACE, not data: the same reasoning that
/// warms the canvas applies, since a card's colour carries no meaning.
///
/// Enforces the two rules that pastels come with, so they can't be forgotten:
///
/// 1. **Ink is fixed.** Pastels don't invert with the theme, so content on
///    them uses `Theme2.blockInk` (9.3:1 on lilac, the worst case) via the
///    `.blockInk` environment this sets. A dynamic token would flip to
///    near-white in dark mode and vanish.
/// 2. **No macro bars.** `Theme2.macroFat` is 1.8–2.9:1 on four of the five
///    pastels, and no fat value clears all five while staying a distinct ramp
///    step — the constraints are mathematically incompatible. Macro bars
///    belong on canvas/surface; pastels host ink, numerals, and glyphs.
///    Matches how the RN app used them: big figure on lime, bars underneath.
struct PastelCard<Content: View>: View {
    enum Tone {
        case lime, lilac, cream, mint, coral

        var color: Color {
            switch self {
            case .lime:  Theme2.Block.lime
            case .lilac: Theme2.Block.lilac
            case .cream: Theme2.Block.cream
            case .mint:  Theme2.Block.mint
            case .coral: Theme2.Block.coral
            }
        }
        /// Vermilion is 2.0–2.9:1 on lilac/mint/coral, so the accent (and
        /// Bevi, whose fur is the same warm family) only goes on these two.
        /// Mirrors DESIGN.md §2.1's existing "Bevi never sits on an
        /// accent-log surface" rule.
        var acceptsAccent: Bool {
            switch self {
            case .lime, .cream: true
            case .lilac, .mint, .coral: false
            }
        }
    }

    let tone: Tone
    @ViewBuilder var content: Content

    var body: some View {
        content
            .foregroundStyle(Theme2.blockInk)
            .padding(Theme2.Space.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tone.color)
            .clipShape(RoundedRectangle(cornerRadius: Theme2.Radius.card, style: .continuous))
    }
}
