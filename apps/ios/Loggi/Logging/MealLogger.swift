import Foundation

/// The save path, shared by every logging entry point (review screen, quick
/// log, favourites). Ports add.tsx's `save()` / `quickLog()`.
///
/// Optimistic by design: the meal lands in `MealCache` and the UI returns to
/// Today *before* the network call, so felt latency is ~0. The POST then
/// settles it, or — on a transport failure — hands it to `SaveQueue` so the
/// meal survives offline rather than dead-ending. That three-way split
/// (settle / queue / discard) is the whole reason this lives in one place
/// instead of at each call site.
@MainActor
enum MealLogger {

    /// Distinguishes "the network is gone" from "the server said no". Only
    /// the former is queueable — a 400 will fail identically on every retry,
    /// so queueing it would loop forever. Mirrors lib/api.ts's isNetworkError.
    private static func isNetworkError(_ error: Error) -> Bool {
        if case APIError.network = error { return true }
        let ns = error as NSError
        return ns.domain == NSURLErrorDomain
    }

    /// Builds the optimistic `ApiMeal` shown before the server has seen it.
    /// The id is a client UUID; `settleMeal` drops it once the real row
    /// exists, and the next reconcile replaces it with the server's version.
    static func optimisticMeal(name: String, items: [DraftItem], source: String,
                               planned: Bool, photos: [DraftPhoto], eatenAt: String) -> ApiMeal {
        let id = "optimistic-\(UUID().uuidString)"

        // Built in steps rather than one nested literal: the single-expression
        // version tripped a "failed to produce diagnostic" compiler crash,
        // which is a type-inference blowup, not a code error.
        let mealItems: [ApiMealItem] = items.map { item in
            ApiMealItem(
                id: "\(id)-\(item.id.uuidString)",
                mealId: id,
                name: item.name,
                portion: item.portion,
                calories: item.calories,
                proteinG: String(item.proteinG),
                carbsG: String(item.carbsG),
                fatG: String(item.fatG),
                satFatG: item.satFatG.map { String($0) },
                fiberG: item.fiberG.map { String($0) },
                sugarG: item.sugarG.map { String($0) },
                sodiumMg: item.sodiumMg.map { String($0) })
        }
        let mealPhotos: [ApiMealPhoto] = photos.map { photo in
            ApiMealPhoto(id: UUID().uuidString, mealId: id, url: photo.url, pathname: photo.pathname)
        }
        return ApiMeal(
            id: id,
            eatenAt: eatenAt,
            name: name.isEmpty ? "Meal" : name,
            note: nil,
            isFavorite: false,
            source: source,
            planned: planned,
            createdAt: eatenAt,
            items: mealItems,
            photos: mealPhotos)
    }

    /// POST body for /api/meals. Snake_case per the route's zod schema.
    private struct SaveBody: Encodable {
        let name: String
        let eaten_at: String
        let source: String
        let planned: Bool
        let items: [DraftItem]
        let photos: [DraftPhoto]
    }

    /// Log a meal. Returns immediately after the optimistic write — the
    /// network work continues in a detached task, exactly like RN's save().
    ///
    /// - Returns: the optimistic meal's id, so a caller can correlate it.
    @discardableResult
    static func log(name: String, items: [DraftItem], source: String,
                    planned: Bool = false, photos: [DraftPhoto] = [],
                    eatenAt: Date = Date()) -> String? {
        let cleaned = items.filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
        guard !cleaned.isEmpty else { return nil }

        let stamp = ISO8601DateFormatter()
        stamp.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let eatenAtString = stamp.string(from: eatenAt)

        let optimistic = optimisticMeal(name: name, items: cleaned, source: source,
                                        planned: planned, photos: photos, eatenAt: eatenAtString)
        MealCache.shared.addOptimisticMeal(optimistic)

        let body = SaveBody(name: name.isEmpty ? "Meal" : name, eaten_at: eatenAtString,
                            source: source, planned: planned, items: cleaned, photos: photos)

        Task {
            do {
                let encoded = try JSONEncoder().encode(body)
                let _: ApiMeal = try await APIClient.shared.postRaw("/api/meals", bodyJSON: encoded)
                MealCache.shared.settleMeal(id: optimistic.id)
            } catch {
                if isNetworkError(error), let encoded = try? JSONEncoder().encode(body) {
                    // Offline: keep the optimistic meal on Today and let the
                    // queue retry. Deliberately NOT settled — it isn't saved yet.
                    SaveQueue.shared.enqueue(QueuedSave(id: optimistic.id, meal: optimistic, bodyJSON: encoded))
                } else {
                    // A real rejection (400/422): the meal will never save, so
                    // remove it rather than leave a phantom on Today.
                    MealCache.shared.discardOptimistic(id: optimistic.id)
                }
            }
        }
        return optimistic.id
    }

    /// One-tap re-log of an existing meal (favourite or recent). Ports
    /// add.tsx's `quickLog` — same optimistic path, no review step.
    @discardableResult
    static func quickLog(_ meal: ApiMeal, on date: Date = Date()) -> String? {
        log(name: meal.name,
            items: itemsToDraft(meal),
            source: "copy",
            photos: meal.photos.map { DraftPhoto(url: $0.url, pathname: $0.pathname) },
            eatenAt: date)
    }

    /// Delete a logged meal. Optimistic in the same spirit: the row disappears
    /// from the cache immediately, and a failure puts it back rather than
    /// leaving the UI lying about what's saved.
    static func delete(_ meal: ApiMeal) {
        MealCache.shared.markDeleted(id: meal.id)
        Task {
            do {
                try await APIClient.shared.delete("/api/meals/\(meal.id)")
                MealCache.shared.confirmDeleted(id: meal.id)
            } catch {
                MealCache.shared.undoDelete(id: meal.id)
            }
        }
    }
}
