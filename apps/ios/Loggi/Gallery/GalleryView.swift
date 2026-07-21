#if DEBUG
import SwiftUI

/// DEBUG-only component gallery — the review surface for the visual system
/// and the screenshot target for the compliance sweep. Reachable via
/// `loggi://gallery` or `-route gallery`.
///
/// Wrapped in `#if DEBUG` in full: this must never ship in a release build.
struct GalleryView: View {
    enum Tab: String, CaseIterable, Identifiable {
        case components = "Components"
        case populated = "Populated"
        case empty = "Empty"
        var id: String { rawValue }
    }

    /// Screenshot automation seam: tap automation is unavailable in this
    /// environment (simctl has no synthetic-tap verb; idb is broken under
    /// Python 3.14), so `-gallery-tab populated|empty` selects the starting
    /// tab from the launch arguments instead of requiring a rebuild per
    /// capture. DEBUG-only, same mechanism as LoggiApp's existing `-route`.
    private static func initialTab() -> Tab {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-gallery-tab"), i + 1 < args.count,
              let tab = Tab.allCases.first(where: { $0.rawValue.lowercased() == args[i + 1].lowercased() })
        else { return .components }
        return tab
    }

    @State private var tab: Tab = GalleryView.initialTab()

    var body: some View {
        VStack(spacing: 0) {
            Picker("View", selection: $tab) {
                ForEach(Tab.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(Theme2.Space.l)
            .background(Theme2.canvas)

            switch tab {
            case .components: componentList
            case .populated: PopulatedComposition()
            case .empty: EmptyComposition()
            }
        }
        .background(Theme2.canvas)
    }

    private var componentList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme2.Space.xl) {
                section("Status — colour + symbol + text") {
                    VStack(alignment: .leading, spacing: Theme2.Space.m) {
                        StatusBadge(status: .onTarget)
                        StatusBadge(status: .over)
                        StatusBadge(status: .over, text: "120 over")
                    }
                }
                section("Macro ramp — protein darkest to fat lightest") {
                    VStack(spacing: Theme2.Space.m) {
                        MacroBar(macro: .protein, grams: 40, goal: 150)
                        MacroBar(macro: .carbs, grams: 60, goal: 200)
                        MacroBar(macro: .fat, grams: 20, goal: 65)
                    }
                }
                section("Calorie ring — under and over") {
                    HStack(spacing: Theme2.Space.l) {
                        CalorieRing(consumed: 1030, goal: 1950)
                        CalorieRing(consumed: 2180, goal: 1950)
                    }
                }
                section("Chart") {
                    CalorieChart(days: GalleryData.week, goal: 1950)
                }
                section("Empty state") {
                    EmptyStateView(
                        title: "Nothing logged yet",
                        message: "Snap a photo of your next meal and it'll show up here.",
                        systemImage: "camera")
                }
            }
            .padding(Theme2.Space.l)
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Theme2.Space.m) {
            Text(title.uppercased())
                .font(Theme2.Text.caption)
                .foregroundStyle(Theme2.inkSecondary)
            SurfaceCard { content() }
        }
    }
}
#endif
