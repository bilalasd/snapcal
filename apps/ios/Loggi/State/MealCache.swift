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
        try? data.write(to: url, options: .atomic)
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
        let newForDay = pendingNew.values.filter { localDateString(parseAPIDate($0.eatenAt) ?? Date()) == date }
        let merged = Array(newForDay) + overlay(server)
        mealsByDate[date] = merged
        persist()
        return merged
    }

    /// Insert an optimistic meal into the cached lists, newest-first, and
    /// protect it from racing refetches until settleMeal()/discardOptimistic().
    func addOptimisticMeal(_ meal: ApiMeal) {
        pendingNew[meal.id] = meal
        let date = localDateString(parseAPIDate(meal.eatenAt) ?? Date())
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

    // --- Added Phase 2: 30-day range cache (History/Today's streak calc) ---
    private(set) var historyRange: [ApiMeal]?
    private var rangeFetchedAt: Date?

    /// Merge a fresh 30-day range fetch with any pending optimistic/delete
    /// overlay, cache it, return it. Mirrors lib/cache.ts's reconcileRange.
    @discardableResult
    func reconcileRange(_ server: [ApiMeal]) -> [ApiMeal] {
        let merged = Array(pendingNew.values) + overlay(server)
        historyRange = merged
        rangeFetchedAt = Date()
        persist()
        return merged
    }

    /// True when the range was fetched under 30s ago — skips a redundant
    /// refetch on tab focus, same threshold as lib/cache.ts's rangeIsFresh.
    func rangeIsFresh() -> Bool {
        guard let t = rangeFetchedAt else { return false }
        return Date().timeIntervalSince(t) < 30
    }

    // --- Added Phase 2: trends (Today smart-goal, Weight, Settings share this) ---
    private(set) var trends: TrendsResponse?

    func setTrends(_ t: TrendsResponse) {
        trends = t
    }

    // --- Added Phase 2: per-day goal history, so a Monday smart-goal change
    // can't retroactively re-grade past days' "on target" status. Mirrors
    // lib/goal-history.ts exactly; kept as its own tiny disk file (not part
    // of Snapshot) since it has its own 90-day retention policy.
    private var goalHistory: [String: Int] = [:]
    private let goalHistoryFile = "goal-history.json"
    private var goalHistoryHydrated = false

    private func hydrateGoalHistoryIfNeeded() {
        guard !goalHistoryHydrated else { return }
        goalHistoryHydrated = true
        let saved: [String: Int] = Disk.read(goalHistoryFile) ?? [:]
        goalHistory = saved.merging(goalHistory) { _, new in new }
    }

    func recordDailyGoal(_ date: String, kcal: Int) {
        hydrateGoalHistoryIfNeeded()
        guard kcal > 0, goalHistory[date] != kcal else { return }
        goalHistory[date] = kcal
        let cutoff = localDateString(Date().addingTimeInterval(-90 * 86_400))
        goalHistory = goalHistory.filter { $0.key >= cutoff }
        Disk.write(goalHistory, to: goalHistoryFile)
    }

    func goalForDate(_ date: String, fallback: Int) -> Int {
        hydrateGoalHistoryIfNeeded()
        return goalHistory[date] ?? fallback
    }

    /// Sign-out: the next account on this device must not inherit this one's data.
    func clear() {
        mealsByDate = [:]
        goals = nil
        pendingNew = [:]
        pendingDelete = []
        historyRange = nil
        rangeFetchedAt = nil
        trends = nil
        goalHistory = [:]
        goalHistoryHydrated = false
        persist()
    }

    private func persist() {
        Disk.write(Snapshot(goals: goals, mealsByDate: mealsByDate), to: snapshotFile)
    }
}
