import XCTest
@testable import Loggi

/// The optimistic save path is the one place a bug silently loses a user's
/// logged meal, so its three outcomes are asserted directly rather than
/// inferred from a screenshot.
@MainActor
final class MealLoggerTests: XCTestCase {

    override func setUp() async throws {
        MealCache.shared.clear()
    }

    private func item(_ name: String, cal: Double = 100) -> DraftItem {
        DraftItem(name: name, portion: "1", calories: cal,
                  proteinG: 10, carbsG: 20, fatG: 5)
    }

    /// The whole point of optimistic logging: the meal is visible BEFORE the
    /// network call resolves.
    func testMealAppearsInCacheImmediately() {
        let today = localDateString()
        XCTAssertNil(MealCache.shared.cachedMeals(for: today)?.first)

        let id = MealLogger.log(name: "Test meal", items: [item("Eggs")], source: "text")
        XCTAssertNotNil(id, "log() should return an optimistic id")

        // reconcileMeals merges pendingNew with the (empty) server list — the
        // same path Today uses on load.
        let merged = MealCache.shared.reconcileMeals(date: today, server: [])
        XCTAssertEqual(merged.count, 1, "the optimistic meal must be visible before the POST resolves")
        XCTAssertEqual(merged.first?.name, "Test meal")
    }

    /// Empty items are rejected — a meal with nothing in it is never valid,
    /// and RN guards the same way ("Add at least one item").
    func testRejectsEmptyItems() {
        XCTAssertNil(MealLogger.log(name: "Empty", items: [], source: "text"))
        XCTAssertNil(MealLogger.log(name: "Blank", items: [item("   ")], source: "text"),
                     "whitespace-only item names should be filtered, leaving nothing to save")
    }

    /// Totals must survive the DraftItem -> ApiMeal conversion. The macros
    /// cross a String boundary on the wire, which is exactly where a silent
    /// precision or formatting bug would hide.
    func testOptimisticMealPreservesTotals() {
        let meal = MealLogger.optimisticMeal(
            name: "Lunch",
            items: [item("Rice", cal: 250), item("Chicken", cal: 300)],
            source: "text", planned: false, photos: [],
            eatenAt: "2026-07-21T12:00:00.000Z")
        let totals = mealTotals(meal)
        XCTAssertEqual(totals.calories, 550, accuracy: 0.001)
        XCTAssertEqual(totals.protein, 20, accuracy: 0.001)
        XCTAssertEqual(totals.carbs, 40, accuracy: 0.001)
        XCTAssertEqual(totals.fat, 10, accuracy: 0.001)
    }

    /// A planned meal is reserved, not eaten: Today excludes it from consumed
    /// macros but subtracts it from the remaining budget.
    func testPlannedFlagSurvives() {
        let meal = MealLogger.optimisticMeal(
            name: "Dinner out", items: [item("Pasta", cal: 600)],
            source: "text", planned: true, photos: [],
            eatenAt: "2026-07-21T20:00:00.000Z")
        XCTAssertTrue(meal.planned)
    }

    /// Optimistic delete hides the meal at once; undo restores it. Without the
    /// undo path a failed delete would leave the UI claiming data is gone.
    func testOptimisticDeleteAndUndo() {
        let today = localDateString()
        MealLogger.log(name: "Doomed", items: [item("Toast")], source: "text")
        var merged = MealCache.shared.reconcileMeals(date: today, server: [])
        guard let target = merged.first else { return XCTFail("setup: expected one meal") }

        MealCache.shared.markDeleted(id: target.id)
        merged = MealCache.shared.reconcileMeals(date: today, server: [])
        XCTAssertTrue(merged.isEmpty, "a deleted meal must disappear immediately")

        MealCache.shared.undoDelete(id: target.id)
        // The optimistic row is gone from pendingNew by design; what undo
        // guarantees is that the SERVER's copy is no longer filtered out.
        let restored = MealCache.shared.reconcileMeals(date: today, server: [target])
        XCTAssertEqual(restored.count, 1, "undo must stop overlaying the delete")
    }
}
