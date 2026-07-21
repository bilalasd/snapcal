#if DEBUG
import SwiftUI

/// Seeds `MealCache` with decoded fixture data so the REAL `TodayView` can be
/// screenshotted without a Clerk session or a network round trip.
///
/// Deliberately goes through `JSONDecoder` against the real `ApiMeal`/`Goals`
/// models rather than constructing values directly: Phase 2 learned the hard
/// way that hand-built mocks hide wire-format bugs (snake_case vs camelCase
/// silently failing to decode). If the fixture stops decoding, that is a
/// signal worth having, not noise to route around.
///
/// DEBUG-only, reachable via `-route today-preview`. Not a test fixture and
/// not shipped — it exists so a screen rebuild can be verified visually.
@MainActor
enum TodayPreviewSeed {
    static func apply(empty: Bool) {
        let today = localDateString()
        let goalsJSON = """
        {
          "daily_calories": 1950, "daily_protein_g": 150,
          "daily_carbs_g": 200, "daily_fat_g": 65,
          "target_rate_kg_per_wk": -0.5, "unit_system": "metric",
          "sex": "male", "age": 34, "height_cm": 178,
          "activity_level": "moderate", "onboarded": true,
          "goal_weight_kg": 72, "adaptive_goal": false
        }
        """
        if let g = try? JSONDecoder().decode(Goals.self, from: Data(goalsJSON.utf8)) {
            MealCache.shared.setGoals(g)
        }
        guard !empty else { return }

        let now = ISO8601DateFormatter()
        now.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        func stamp(_ hour: Int) -> String {
            let cal = Calendar.current
            let date = cal.date(bySettingHour: hour, minute: 20, second: 0, of: Date()) ?? Date()
            return now.string(from: date)
        }
        // Field-complete per ApiMeal/ApiMealItem: mealId, isFavorite, createdAt
        // and photos are all NON-optional. The first draft omitted them and the
        // `try?` swallowed the DecodingError, producing a silently-empty screen
        // that looked like a layout bug. Decode errors here are now logged.
        let mealsJSON = """
        [
          {"id":"m1","mealId":"m1","name":"Oatmeal with berries","eatenAt":"\(stamp(8))",
           "note":null,"isFavorite":false,"source":"photo","planned":false,
           "createdAt":"\(stamp(8))","photos":[],
           "items":[{"id":"i1","mealId":"m1","name":"Oatmeal","portion":"1 bowl","calories":320,
                     "proteinG":"12.0","carbsG":"54.0","fatG":"6.0",
                     "satFatG":null,"fiberG":null,"sugarG":null,"sodiumMg":null},
                    {"id":"i2","mealId":"m1","name":"Blueberries","portion":"80 g","calories":100,
                     "proteinG":"1.0","carbsG":"14.0","fatG":"0.5",
                     "satFatG":null,"fiberG":null,"sugarG":null,"sodiumMg":null}]},
          {"id":"m2","mealId":"m2","name":"Chicken salad","eatenAt":"\(stamp(13))",
           "note":null,"isFavorite":false,"source":"photo","planned":false,
           "createdAt":"\(stamp(13))","photos":[],
           "items":[{"id":"i3","mealId":"m2","name":"Grilled chicken","portion":"180 g","calories":390,
                     "proteinG":"58.0","carbsG":"0.0","fatG":"16.0",
                     "satFatG":null,"fiberG":null,"sugarG":null,"sodiumMg":null},
                    {"id":"i4","mealId":"m2","name":"Mixed leaves","portion":"1 bowl","calories":220,
                     "proteinG":"5.0","carbsG":"18.0","fatG":"14.0",
                     "satFatG":null,"fiberG":null,"sugarG":null,"sodiumMg":null}]},
          {"id":"m3","mealId":"m3","name":"Dinner out (reserved)","eatenAt":"\(stamp(20))",
           "note":null,"isFavorite":false,"source":"manual","planned":true,
           "createdAt":"\(stamp(20))","photos":[],
           "items":[{"id":"i5","mealId":"m3","name":"Pasta","portion":"1 plate","calories":600,
                     "proteinG":"20.0","carbsG":"80.0","fatG":"18.0",
                     "satFatG":null,"fiberG":null,"sugarG":null,"sodiumMg":null}]}
        ]
        """
        do {
            let meals = try JSONDecoder().decode([ApiMeal].self, from: Data(mealsJSON.utf8))
            _ = MealCache.shared.reconcileMeals(date: today, server: meals)
        } catch {
            // Loud on purpose. A `try?` here swallowed a missing-field
            // DecodingError once and produced a silently-empty screen that
            // looked like a layout bug — cost a full debug cycle.
            assertionFailure("TodayPreviewSeed fixture failed to decode: \(error)")
        }
    }
}
#endif
