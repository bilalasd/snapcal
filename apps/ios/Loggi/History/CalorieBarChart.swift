import SwiftUI
import Charts

/// Calories/day bar chart for History's "Plate index" card. Ports
/// apps/mobile/components/charts.tsx's `BarChart`.
///
/// DESIGN.md §2.2 "Charts route through useColors()": bars/axes use the
/// dynamic Theme tokens (not fixed black), even though this chart sits on
/// the fixed-ink lilac block card — chart geometry is the one documented
/// exception to that card's fixed-ink rule. Bars over the goal switch to
/// Theme.destructive, mirroring the RN chart's
/// `fill={over ? c.destructive : c.foreground}`. Axis label size floors at
/// 11px per DESIGN.md §2.3 ("chart goal line" is explicitly named as a
/// micro-caption that must not sit below the 11px HIG floor).
///
/// The x-axis plots `data`'s integer index (not the day-label String)
/// deliberately: a String-categorical BarMark axis divides its axis into one
/// slot per distinct category regardless of how many AxisMarks values are
/// requested, so on a 30-day range every slot is ~805pt/30 ≈ 27pt wide and
/// silently drops any label text too wide for its own slot (confirmed via
/// on-device screenshot — first/last labels rendered blank even after
/// requesting only 3 marks). An Int index axis isn't sliced per-category, so
/// the same 3-label thinning renders its full text.
struct CalorieBarChart: View {
    struct Point: Identifiable {
        let id = UUID()
        let label: String
        let calories: Double
    }
    let data: [Point]
    let goal: Double?

    var body: some View {
        Chart {
            ForEach(Array(data.enumerated()), id: \.element.id) { index, point in
                BarMark(x: .value("Day", index), y: .value("Calories", point.calories))
                    .foregroundStyle(isOverGoal(point) ? Theme.destructive : Theme.foreground)
                    .cornerRadius(3)
            }
            if let goal {
                RuleMark(y: .value("Goal", goal))
                    .foregroundStyle(Theme.mutedForeground)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { _ in
                AxisValueLabel().font(.system(size: 11, weight: .regular)).foregroundStyle(Theme.mutedForeground)
                AxisGridLine().foregroundStyle(Theme.mutedForeground.opacity(0.15))
            }
        }
        .chartXAxis {
            AxisMarks(values: sparseXIndices) { value in
                // Anchor the first/last labels inward (leading/trailing)
                // instead of centered, so they don't get clipped hanging
                // past the plot's own edge — confirmed via on-device
                // screenshot that a centered last-index label silently
                // fails to render when it would overhang the trailing edge.
                AxisValueLabel(anchor: anchor(for: value)) {
                    if let idx = value.as(Int.self), data.indices.contains(idx) {
                        Text(data[idx].label)
                            .font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.mutedForeground)
                    }
                }
            }
        }
        .frame(height: 176)
    }

    /// First, middle, last indices only (deduped for tiny datasets) — mirrors
    /// charts.tsx's `[...new Set([0, Math.floor(n / 2), n - 1])]`.
    private var sparseXIndices: [Int] {
        guard !data.isEmpty else { return [] }
        return Array(Set([0, data.count / 2, data.count - 1])).sorted()
    }

    private func anchor(for value: AxisValue) -> UnitPoint {
        guard let idx = value.as(Int.self) else { return .center }
        if idx == 0 { return .leading }
        if idx == data.count - 1 { return .trailing }
        return .center
    }

    private func isOverGoal(_ point: Point) -> Bool {
        guard let goal else { return false }
        return point.calories > goal
    }
}
