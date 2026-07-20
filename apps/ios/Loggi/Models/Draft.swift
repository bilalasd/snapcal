import Foundation

struct DraftItem: Codable, Equatable, Identifiable {
    var id = UUID()
    var name: String
    var portion: String
    var calories: Double
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
    var satFatG: Double?
    var fiberG: Double?
    var sugarG: Double?
    var sodiumMg: Double?

    enum CodingKeys: String, CodingKey {
        case name, portion, calories
        case proteinG = "protein_g"
        case carbsG = "carbs_g"
        case fatG = "fat_g"
        case satFatG = "sat_fat_g"
        case fiberG = "fiber_g"
        case sugarG = "sugar_g"
        case sodiumMg = "sodium_mg"
    }
}

struct DraftPhoto: Codable, Equatable {
    var url: String
    var pathname: String
}

struct MealDraft: Codable {
    var name: String
    var eatenAt: String
    var note: String?
    var source: String // "photo" | "text" | "favorite" | "copy"
    var items: [DraftItem]
    var photos: [DraftPhoto]?

    enum CodingKeys: String, CodingKey {
        case name
        case eatenAt = "eaten_at"
        case note, source, items, photos
    }
}

func itemsToDraft(_ meal: ApiMeal) -> [DraftItem] {
    meal.items.map { item in
        DraftItem(
            name: item.name, portion: item.portion, calories: item.calories,
            proteinG: Double(item.proteinG) ?? 0, carbsG: Double(item.carbsG) ?? 0,
            fatG: Double(item.fatG) ?? 0,
            satFatG: item.satFatG.flatMap(Double.init),
            fiberG: item.fiberG.flatMap(Double.init),
            sugarG: item.sugarG.flatMap(Double.init),
            sodiumMg: item.sodiumMg.flatMap(Double.init))
    }
}
