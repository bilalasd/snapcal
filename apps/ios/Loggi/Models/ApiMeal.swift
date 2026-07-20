import Foundation

struct ApiMealItem: Codable, Identifiable, Equatable {
    let id: String
    let mealId: String
    let name: String
    let portion: String
    let calories: Double
    let proteinG: String
    let carbsG: String
    let fatG: String
    let satFatG: String?
    let fiberG: String?
    let sugarG: String?
    let sodiumMg: String?
}

struct ApiMealPhoto: Codable, Identifiable, Equatable {
    let id: String
    let mealId: String
    let url: String
    let pathname: String
}

struct ApiMeal: Codable, Identifiable, Equatable {
    let id: String
    let eatenAt: String
    let name: String
    let note: String?
    let isFavorite: Bool
    let source: String
    let planned: Bool
    let createdAt: String
    let items: [ApiMealItem]
    let photos: [ApiMealPhoto]

    // Verified against the live production API 2026-07-20: the deployed
    // /api/meals response omits "planned" (older deploy, predates that
    // field landing in apps/api/src) — decode it as false rather than
    // failing the whole meal when the server hasn't caught up to the spec.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        eatenAt = try c.decode(String.self, forKey: .eatenAt)
        name = try c.decode(String.self, forKey: .name)
        note = try c.decodeIfPresent(String.self, forKey: .note)
        isFavorite = try c.decode(Bool.self, forKey: .isFavorite)
        source = try c.decode(String.self, forKey: .source)
        planned = try c.decodeIfPresent(Bool.self, forKey: .planned) ?? false
        createdAt = try c.decode(String.self, forKey: .createdAt)
        items = try c.decode([ApiMealItem].self, forKey: .items)
        photos = try c.decode([ApiMealPhoto].self, forKey: .photos)
    }
}

/// Local calendar date as YYYY-MM-DD, matching lib/shared's localDateString().
func localDateString(_ date: Date = Date()) -> String {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    f.timeZone = .current
    f.locale = Locale(identifier: "en_US_POSIX")
    f.calendar = Calendar(identifier: .gregorian)
    return f.string(from: date)
}

/// Minutes to add to UTC midnight to get local midnight — matches
/// getTimezoneOffset() sign convention (positive = behind UTC).
func tzOffsetMinutes() -> Int {
    -TimeZone.current.secondsFromGMT() / 60
}

/// Parses an API timestamp (e.g. eatenAt), tolerating both fractional-second
/// (toISOString()'s always-emitted .SSSZ) and plain ISO 8601 forms.
func parseAPIDate(_ s: String) -> Date? {
    let withFractional = ISO8601DateFormatter()
    withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = withFractional.date(from: s) { return d }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: s)
}

func mealTotals(_ meal: ApiMeal) -> (calories: Double, protein: Double, carbs: Double, fat: Double) {
    meal.items.reduce((0.0, 0.0, 0.0, 0.0)) { acc, item in
        (acc.0 + item.calories,
         acc.1 + (Double(item.proteinG) ?? 0),
         acc.2 + (Double(item.carbsG) ?? 0),
         acc.3 + (Double(item.fatG) ?? 0))
    }
}
