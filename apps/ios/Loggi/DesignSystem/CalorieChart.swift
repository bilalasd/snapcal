import SwiftUI
import Charts

/// Daily calories against goal. Per-bar colour encodes goal status, and the
/// dashed rule plus the per-bar accessibility label carry the same information
/// non-visually (spec §3.3a — over/under is never colour-only).
struct CalorieChart: View {
    struct Day: Identifiable {
        let id = UUID()
        let date: String
        /// MUST be unique across `days`. This is the categorical x-axis key,
        /// and Charts merges same-keyed categories — single-letter weekday
        /// labels ("T" for Tue AND Thu, "S" for Sat AND Sun) silently
        /// collapsed two bars out of a seven-day week. Use "Tue"/"Thu", or
        /// the date, not the initial.
        let label: String
        let calories: Double
    }

    let days: [Day]
    let goal: Double

    private func status(_ day: Day) -> GoalStatus {
        goal > 0 && day.calories > goal ? .over : .onTarget
    }

    /// Bars are measured from zero, so the domain MUST start at zero — twice
    /// over. Rendering: `BarMark` always draws from 0, so a raised lower bound
    /// makes bars extend below the plot area and spill outside the view's
    /// frame (this happened; `.clipped()` merely hid the overdraw along with
    /// the x-axis labels). Honesty: bar length encodes magnitude, so a
    /// truncated baseline misstates the ratio between days.
    ///
    /// A zoomed lower bound is right for the weight TREND LINE (narrow band,
    /// position encodes value) — that logic does not transfer to bars.
    private var yDomain: ClosedRange<Double> {
        let hi = max(days.map(\.calories).max() ?? 0, goal) * 1.15
        return 0...(hi > 0 ? hi : 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.s) {
            chart
            if goal > 0 {
                HStack(spacing: Theme2.Space.xs) {
                    // Dash glyph mirrors the rule's stroke, so the legend is
                    // legible without relying on colour.
                    Rectangle()
                        .fill(Theme2.inkSecondary)
                        .frame(width: 14, height: 1)
                    Text("Goal \(Int(goal)) cal")
                        .font(Theme2.Text.caption)
                        .foregroundStyle(Theme2.inkSecondary)
                        .monospacedDigit()
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Goal \(Int(goal)) calories")
            }
        }
    }

    private var chart: some View {
        Chart {
            ForEach(days) { day in
                BarMark(
                    x: .value("Day", day.label),
                    y: .value("Calories", day.calories)
                )
                .foregroundStyle(status(day).color)
                .cornerRadius(4)
                .accessibilityLabel(day.date)
                .accessibilityValue("\(Int(day.calories)) calories, \(status(day).label)")
            }
            if goal > 0 {
                // No .annotation here: an annotation on a RuleMark is drawn
                // OUTSIDE the plot area, which pushed the bars out of the card
                // and collided with the y-axis labels. The goal is labelled
                // below the chart instead.
                RuleMark(y: .value("Goal", goal))
                    .foregroundStyle(Theme2.inkSecondary)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
            }
        }
        .chartYScale(domain: yDomain)
        .chartYAxis {
            AxisMarks(position: .leading) { _ in
                AxisGridLine().foregroundStyle(Theme2.hairline)
                AxisValueLabel().font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
            }
        }
        .chartXAxis {
            // Enumerate the category values explicitly. With a String x-axis,
            // both bare `AxisMarks` and `.automatic` dropped every label here —
            // a silent Charts failure that BUILD SUCCEEDED never reveals, and
            // that only showed up in a screenshot.
            AxisMarks(preset: .aligned, values: days.map(\.label)) { value in
                AxisValueLabel {
                    if let label = value.as(String.self) {
                        Text(label)
                            .font(Theme2.Text.caption)
                            .foregroundStyle(Theme2.inkSecondary)
                    }
                }
            }
        }
        .frame(height: 180)
        .accessibilityLabel("Daily calories")
    }
}
