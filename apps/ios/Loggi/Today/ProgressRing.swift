import SwiftUI

/// Compact calorie-progress ring for the Today hero card, matching the RN
/// `<ProgressRing size="compact">` (components/progress-ring.tsx): 128px
/// physical size, 200-unit viewBox with a 16-unit stroke (scaled: 128 *
/// 16/200 ≈ 10pt), `text-2xl` (24px) label, `text-xs` (12px) sublabel — the
/// 12px sublabel also satisfies DESIGN.md §2.3's 11px text floor. Swift
/// Charts isn't needed for a single ring — a trimmed `Circle` is simpler and
/// matches DESIGN.md's "no shadows/flat+hairline" aesthetic.
struct ProgressRing: View {
    let value: Double
    let max: Double
    let label: String
    let sublabel: String

    private var fraction: Double {
        guard max > 0 else { return 0 }
        return min(value / max, 1)
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.black.opacity(0.12), lineWidth: 10)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(Color.black, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text(label).font(.system(size: 24, weight: .black)).foregroundStyle(.black)
                Text(sublabel).font(.system(size: 12, weight: .bold)).foregroundStyle(.black.opacity(0.6))
            }
        }
        .frame(width: 128, height: 128)
        .animation(Theme.Motion.standard, value: fraction)
    }
}
