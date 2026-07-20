import Foundation
import Observation

/// Tiny JSON-on-disk helper for the cache/queue safety nets — mirrors
/// lib/disk.ts's readJson/writeJson. All errors are swallowed: persistence is
/// best-effort, the app must behave identically with a broken disk, just
/// without the safety net.
enum Disk {
    static func read<T: Decodable>(_ filename: String) -> T? {
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent(filename)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
    static func write<T: Encodable>(_ value: T, to filename: String) {
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent(filename)
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: url)
    }
}

/// In-memory stale-while-revalidate cache: RootView shows the last data
/// instantly, then refreshes in the background — no skeleton flash. Mirrors
/// lib/cache.ts's meal/goals surface. Phase-1-scoped: no historyRange/trends/
/// favorites/recents slots (arrive with the screens that need them in Phase
/// 2/3), no widget sync (Phase 4), no pendingEdit (nothing in Phase 1 edits a
/// meal yet).
@MainActor
@Observable
final class MealCache {
    static let shared = MealCache()

    private(set) var mealsByDate: [String: [ApiMeal]] = [:]
    private(set) var goals: Goals?
    private var pendingNew: [String: ApiMeal] = [:]
    private var pendingDelete: Set<String> = []

    private struct Snapshot: Codable {
        var goals: Goals?
        var mealsByDate: [String: [ApiMeal]]
    }
    private let snapshotFile = "cache-snapshot.json"

    /// App start: restore the last session's cache. In-memory data always
    /// wins over the disk copy.
    func hydrate() {
        guard let saved: Snapshot = Disk.read(snapshotFile) else { return }
        if goals == nil { goals = saved.goals }
        for (date, meals) in saved.mealsByDate where mealsByDate[date] == nil {
            mealsByDate[date] = meals
        }
    }

    func cachedMeals(for date: String) -> [ApiMeal]? { mealsByDate[date] }
    func cachedGoals() -> Goals? { goals }

    func setGoals(_ g: Goals) {
        goals = g
        persist()
    }

    private func overlay(_ server: [ApiMeal]) -> [ApiMeal] {
        server.filter { !pendingDelete.contains($0.id) }
    }

    /// Merge a server response for one day with in-flight mutations, cache
    /// it, return it.
    @discardableResult
    func reconcileMeals(date: String, server: [ApiMeal]) -> [ApiMeal] {
        let newForDay = pendingNew.values.filter { localDateString(ISO8601DateFormatter().date(from: $0.eatenAt) ?? Date()) == date }
        let merged = Array(newForDay) + overlay(server)
        mealsByDate[date] = merged
        persist()
        return merged
    }

    /// Insert an optimistic meal into the cached lists, newest-first, and
    /// protect it from racing refetches until settleMeal()/discardOptimistic().
    func addOptimisticMeal(_ meal: ApiMeal) {
        pendingNew[meal.id] = meal
        let date = localDateString(ISO8601DateFormatter().date(from: meal.eatenAt) ?? Date())
        mealsByDate[date] = [meal] + (mealsByDate[date] ?? [])
        persist()
    }

    /// The background request landed — stop protecting this meal.
    func settleMeal(id: String) {
        pendingNew.removeValue(forKey: id)
    }

    /// A failed optimistic save: drop the stand-in meal entirely.
    func discardOptimistic(id: String) {
        pendingNew.removeValue(forKey: id)
        for key in mealsByDate.keys {
            mealsByDate[key] = mealsByDate[key]?.filter { $0.id != id }
        }
        persist()
    }

    /// Sign-out: the next account on this device must not inherit this one's data.
    func clear() {
        mealsByDate = [:]
        goals = nil
        pendingNew = [:]
        pendingDelete = []
    }

    private func persist() {
        Disk.write(Snapshot(goals: goals, mealsByDate: mealsByDate), to: snapshotFile)
    }
}
