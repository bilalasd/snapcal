import SwiftUI

/// One macro. RN `MACRO_INK`: protein/carbs/fat fill bars in foreground /
/// 70% / 50% ink (they track the theme). The label identifies which macro,
/// so the bars don't rely on colour alone.
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

/// A labelled macro bar. The bars are ink shades (RN `MACRO_INK`), so the
/// label is what names the macro — never render the bar without it.
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
