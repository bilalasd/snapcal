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
