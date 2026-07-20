import Foundation

/// A meal save that fails at the transport level keeps its optimistic UI and
/// lands here instead of being discarded — the log never dead-ends on a dead
/// network. Mirrors lib/queue.ts's QueuedSave. Flushed on app start (hydrate)
/// and after the previous flush finishes.
struct QueuedSave: Codable {
    var id: String
    var meal: ApiMeal
    var bodyJSON: Data // encoded POST /api/meals body
}

@MainActor
@Observable
final class SaveQueue {
    static let shared = SaveQueue()
    private(set) var pending: [QueuedSave] = []
    private var hydrated = false
    private var flushing = false
    private let file = "save-queue.json"

    /// App start: reload pending saves, show their meals, try to send them.
    func hydrate() {
        guard !hydrated else { return }
        hydrated = true
        pending = Disk.read(file) ?? []
        for q in pending { MealCache.shared.addOptimisticMeal(q.meal) }
        if !pending.isEmpty { Task { await flush() } }
    }

    func enqueue(_ entry: QueuedSave) {
        pending.append(entry)
        persist()
    }

    /// Sends queued saves in order. Stops at the first transport failure
    /// (still offline); drops entries the server actually rejected.
    func flush() async {
        guard !flushing, !pending.isEmpty else { return }
        flushing = true
        defer { flushing = false }
        while let q = pending.first {
            do {
                struct Empty: Decodable {}
                let _: Empty = try await APIClient.shared.postRaw("/api/meals", bodyJSON: q.bodyJSON)
                MealCache.shared.settleMeal(id: q.id)
            } catch APIError.network {
                return // still offline — keep everything, retry later
            } catch {
                MealCache.shared.discardOptimistic(id: q.id) // server rejected — don't retry
            }
            pending.removeFirst()
            persist()
        }
    }

    private func persist() {
        Disk.write(pending, to: file)
    }
}
