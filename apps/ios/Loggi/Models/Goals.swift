import Foundation

enum ActivityLevel: String, Codable {
    case sedentary, light, moderate, active
    case veryActive = "very_active"
}

enum UnitSystem: String, Codable {
    case metric, imperial
}

enum Sex: String, Codable {
    case male, female
}

struct Goals: Codable, Equatable {
    var dailyCalories: Int
    var dailyProteinG: Int
    var dailyCarbsG: Int
    var dailyFatG: Int
    var targetRateKgPerWk: Double
    var unitSystem: UnitSystem
    var sex: Sex?
    var age: Int?
    var heightCm: Double?
    var activityLevel: ActivityLevel?
    var onboarded: Bool
    var goalWeightKg: Double?
    var adaptiveGoal: Bool

    enum CodingKeys: String, CodingKey {
        case dailyCalories = "daily_calories"
        case dailyProteinG = "daily_protein_g"
        case dailyCarbsG = "daily_carbs_g"
        case dailyFatG = "daily_fat_g"
        case targetRateKgPerWk = "target_rate_kg_per_wk"
        case unitSystem = "unit_system"
        case sex, age
        case heightCm = "height_cm"
        case activityLevel = "activity_level"
        case onboarded
        case goalWeightKg = "goal_weight_kg"
        case adaptiveGoal = "adaptive_goal"
    }
}
