import SwiftUI
import Charts

/// Weight trend chart for the Weight screen's "Latest weigh-in" block-cream
/// card. Ports apps/mobile/components/charts.tsx's `WeightChart` (measured
/// dots + smoothed trend line + inline legend + sparse first/last x-axis
/// labels).
///
/// Second Swift Charts usage in this codebase — read
/// History/CalorieBarChart.swift first; its doc comment documents two real
/// on-device-discovered pitfalls this chart avoids by construction rather
/// than rediscovering them:
/// (1) a String-categorical x-axis (the axis type is driven by the plotted
/// value's type, not the mark type — PointMark/LineMark are just as
/// affected as BarMark) silently drops per-category labels too wide for
/// their auto-divided slot, so this chart plots an `Int` index for x (not
/// the date-label `String`) and resolves the label text via
/// `points[idx].label` inside `AxisValueLabel`, exactly like
/// `CalorieBarChart`;
/// (2) a centered axis label sitting at the plot's own edge can fail to
/// render entirely rather than clip/overflow, so the first/last labels are
/// anchored `.leading`/`.trailing` instead of `.center`, same fix.
///
/// DESIGN.md §2.2 "Charts route through useColors() — three roles": primary
/// series (trend line) = Theme2.ink, secondary marks (measured dots,
/// axis labels, dashed goal line) = Theme2.inkSecondary — mirrors
/// charts.tsx's `WeightChart` exactly (`c.foreground` for the trend `Path`,
/// `c.mutedForeground` for dots/goal/axis/legend). This card sits on the
/// fixed-ink `Theme2.Block.cream` card, but per `CalorieBarChart`'s doc
/// comment chart geometry is the one documented exception to that card's
/// fixed-ink rule — colors here route through the dynamic Theme tokens, not
/// `Color.black`.
///
/// RN's `WeightChart` labels only the first and last x-axis positions (its
/// own `[...new Set([0, n - 1])]`), unlike the bar chart's
/// first/middle/last — matched here via `sparseXIndices`.
struct WeightTrendChart: View {
    struct Point: Identifiable {
        let id = UUID()
        let label: String
        let measured: Double
        let trend: Double
    }
    let points: [Point]
    let goal: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.s) {
            legend
            Chart {
                ForEach(Array(points.enumerated()), id: \.element.id) { index, p in
                    PointMark(x: .value("Day", index), y: .value("Weight", p.measured))
                        .foregroundStyle(Theme2.inkSecondary.opacity(0.5))
                        .symbolSize(20)
                    LineMark(x: .value("Day", index), y: .value("Trend", p.trend))
                        .foregroundStyle(Theme2.ink)
                        .interpolationMethod(.catmullRom)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                }
                if let goal {
                    RuleMark(y: .value("Goal", goal))
                        .foregroundStyle(Theme2.inkSecondary)
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                }
            }
            .chartYScale(domain: yDomain)
            .chartXAxis {
                AxisMarks(values: sparseXIndices) { value in
                    AxisValueLabel(anchor: anchor(for: value)) {
                        if let idx = value.as(Int.self), points.indices.contains(idx) {
                            Text(points[idx].label)
                                .font(Theme2.Text.caption)
                                .foregroundStyle(Theme2.inkSecondary)
                        }
                    }
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { _ in
                    AxisValueLabel().font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                    AxisGridLine().foregroundStyle(Theme2.inkSecondary.opacity(0.15))
                }
            }
            .frame(height: 200)
        }
    }

    /// Mirrors charts.tsx's inline `Measured`/`Trend` swatch row above the
    /// SVG chart.
    private var legend: some View {
        HStack(spacing: Theme2.Space.l) {
            HStack(spacing: 6) {
                Circle().fill(Theme2.inkSecondary.opacity(0.6)).frame(width: 6, height: 6)
                Text("Measured").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
            }
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 2).fill(Theme2.ink).frame(width: 12, height: 2.5)
                Text("Trend").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
            }
        }
    }

    /// Explicit y-domain, padded 10% above/below the tightest range that
    /// fits every plotted value (measured, trend, and goal) — mirrors
    /// charts.tsx's `WeightChart` exactly (`lo = min - range*0.1`,
    /// `hi = max + range*0.1`). Third real on-device Swift Charts pitfall
    /// found in this codebase (see History/CalorieBarChart.swift for the
    /// first two): with only `PointMark`/`LineMark`/`RuleMark` and no
    /// explicit `.chartYScale`, Swift Charts' `.automatic` y-axis picked a
    /// "nice round number" domain that started at 0 even though every
    /// plotted value sat between ~180 and ~198 — confirmed on-device via
    /// screenshot, where the trend line rendered nearly flat and squashed
    /// against the top of the chart, defeating the entire point of a trend
    /// chart (showing variation). An explicit domain fixes it.
    private var yDomain: ClosedRange<Double> {
        var vals = points.flatMap { [$0.measured, $0.trend] }
        if let goal { vals.append(goal) }
        guard let lo0 = vals.min(), let hi0 = vals.max() else { return 0...1 }
        let range = max(hi0 - lo0, 1)
        return (lo0 - range * 0.1)...(hi0 + range * 0.1)
    }

    /// First and last indices only (deduped for a single-point chart) —
    /// mirrors charts.tsx's `WeightChart`'s `[...new Set([0, n - 1])]`, not
    /// the bar chart's first/middle/last.
    private var sparseXIndices: [Int] {
        guard !points.isEmpty else { return [] }
        return Array(Set([0, points.count - 1])).sorted()
    }

    private func anchor(for value: AxisValue) -> UnitPoint {
        guard let idx = value.as(Int.self) else { return .center }
        if idx == 0 { return .leading }
        if idx == points.count - 1 { return .trailing }
        return .center
    }
}
