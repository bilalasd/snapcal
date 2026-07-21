#if DEBUG
import SwiftUI

/// A realistic populated screen. The gallery exists to answer "does the system
/// hold together on a real screen", which a component grid cannot show.
struct PopulatedComposition: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme2.Space.l) {
                VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                    Text("Today").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                    Text("Good afternoon").font(Theme2.Text.title).foregroundStyle(Theme2.ink)
                }
                SurfaceCard {
                    VStack(spacing: Theme2.Space.l) {
                        CalorieRing(consumed: 1030, goal: 1950)
                        VStack(spacing: Theme2.Space.m) {
                            MacroBar(macro: .protein, grams: 40, goal: 150)
                            MacroBar(macro: .carbs, grams: 60, goal: 200)
                            MacroBar(macro: .fat, grams: 20, goal: 65)
                        }
                    }
                }
                SurfaceCard {
                    VStack(alignment: .leading, spacing: Theme2.Space.m) {
                        Text("Last 7 days").font(Theme2.Text.label).foregroundStyle(Theme2.ink)
                        CalorieChart(days: GalleryData.week, goal: 1950)
                    }
                }
            }
            .padding(Theme2.Space.l)
        }
        .background(Theme2.canvas)
    }
}

/// The empty screen — spec §9.1's risk surface. This is the composition to
/// judge first: it must read as calm and inviting, NOT blank and cold.
struct EmptyComposition: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme2.Space.l) {
                VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                    Text("Today").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                    Text("Good morning").font(Theme2.Text.title).foregroundStyle(Theme2.ink)
                }
                SurfaceCard {
                    VStack(spacing: Theme2.Space.l) {
                        CalorieRing(consumed: 0, goal: 1950)
                        VStack(spacing: Theme2.Space.m) {
                            MacroBar(macro: .protein, grams: 0, goal: 150)
                            MacroBar(macro: .carbs, grams: 0, goal: 200)
                            MacroBar(macro: .fat, grams: 0, goal: 65)
                        }
                    }
                }
                SurfaceCard {
                    EmptyStateView(
                        title: "Nothing logged yet",
                        message: "Snap a photo of your next meal and it'll show up here.",
                        systemImage: "camera")
                }
            }
            .padding(Theme2.Space.l)
        }
        .background(Theme2.canvas)
    }
}

enum GalleryData {
    static let week: [CalorieChart.Day] = [
        .init(date: "Mon 14 Jul", label: "Mon", calories: 1820),
        .init(date: "Tue 15 Jul", label: "Tue", calories: 1640),
        .init(date: "Wed 16 Jul", label: "Wed", calories: 2240),
        .init(date: "Thu 17 Jul", label: "Thu", calories: 1910),
        .init(date: "Fri 18 Jul", label: "Fri", calories: 2480),
        .init(date: "Sat 19 Jul", label: "Sat", calories: 1750),
        .init(date: "Sun 20 Jul", label: "Sun", calories: 1030),
    ]
}
#endif
