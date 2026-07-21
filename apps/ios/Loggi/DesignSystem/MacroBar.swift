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
