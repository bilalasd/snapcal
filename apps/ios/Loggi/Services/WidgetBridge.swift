import Foundation
import WidgetKit

/// Publishes today's totals to the app group so the widget has something to
/// render. Ports lib/widget.ts.
///
/// This closes a real gap: `LoggiWidgets` has always READ `widgetData` from
/// the shared UserDefaults, but nothing in the app ever wrote it — so the
/// widget would have shown its fresh-install state forever.
///
/// The shape must stay byte-compatible with `WidgetData` in
/// LoggiWidgets/Widgets.swift. It's duplicated rather than shared because the
/// widget extension deliberately doesn't link the app's model layer, and this
/// struct is nine numbers that change only when the widget changes.
enum WidgetBridge {
    private static let appGroup = "group.com.loggi.app"
    private static let key = "widgetData"

    private struct Payload: Codable {
        var date: String
        var calories: Double
        var caloriesGoal: Double
        var protein: Double
        var proteinGoal: Double
        var carbs: Double
        var carbsGoal: Double
        var fat: Double
        var fatGoal: Double
    }

    /// Recompute from the cache and hand it to the widget. Cheap and
    /// idempotent, so it's safe to call after any load or save.
    @MainActor
    static func publish() {
        let today = localDateString()
        guard let goals = MealCache.shared.cachedGoals() else { return }
        let meals = MealCache.shared.cachedMeals(for: today) ?? []

        // Planned meals are reserved, not eaten — excluded here for the same
        // reason Today excludes them from consumed macros.
        let eaten = meals.filter { !$0.planned }
        let totals = eaten.reduce(into: (c: 0.0, p: 0.0, cb: 0.0, f: 0.0)) { acc, meal in
            let t = mealTotals(meal)
            acc.c += t.calories; acc.p += t.protein; acc.cb += t.carbs; acc.f += t.fat
        }

        let payload = Payload(
            date: today,
            calories: totals.c, caloriesGoal: Double(goals.dailyCalories),
            protein: totals.p, proteinGoal: Double(goals.dailyProteinG),
            carbs: totals.cb, carbsGoal: Double(goals.dailyCarbsG),
            fat: totals.f, fatGoal: Double(goals.dailyFatG))

        guard let data = try? JSONEncoder().encode(payload),
              let json = String(data: data, encoding: .utf8),
              let defaults = UserDefaults(suiteName: appGroup) else { return }
        defaults.set(json, forKey: key)
        WidgetCenter.shared.reloadAllTimelines()
    }
}
