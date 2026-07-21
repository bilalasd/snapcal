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
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(isOver ? "cal over" : "cal left")
                    .font(Theme2.Text.caption)
                    .foregroundStyle(Theme2.inkSecondary)
                    .minimumScaleFactor(0.8)
                    .lineLimit(1)
            }
            .padding(.horizontal, Theme2.Space.xl)
        }
        .frame(width: 180, height: 180)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(isOver ? "Over target" : "Calories remaining")
        .accessibilityValue("\(abs(remaining)) calories \(isOver ? "over" : "left"), \(Int(consumed)) of \(Int(goal)) eaten")
    }
}
