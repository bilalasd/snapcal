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

    // Verified against the live production API 2026-07-20: the deployed
    // /api/goals response omits "adaptive_goal" (older deploy, predates
    // that field landing in apps/api/src) — decode it as false rather
    // than failing the whole Goals object when the server lags the spec.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        dailyCalories = try c.decode(Int.self, forKey: .dailyCalories)
        dailyProteinG = try c.decode(Int.self, forKey: .dailyProteinG)
        dailyCarbsG = try c.decode(Int.self, forKey: .dailyCarbsG)
        dailyFatG = try c.decode(Int.self, forKey: .dailyFatG)
        targetRateKgPerWk = try c.decode(Double.self, forKey: .targetRateKgPerWk)
        unitSystem = try c.decode(UnitSystem.self, forKey: .unitSystem)
        sex = try c.decodeIfPresent(Sex.self, forKey: .sex)
        age = try c.decodeIfPresent(Int.self, forKey: .age)
        heightCm = try c.decodeIfPresent(Double.self, forKey: .heightCm)
        activityLevel = try c.decodeIfPresent(ActivityLevel.self, forKey: .activityLevel)
        onboarded = try c.decode(Bool.self, forKey: .onboarded)
        goalWeightKg = try c.decodeIfPresent(Double.self, forKey: .goalWeightKg)
        adaptiveGoal = try c.decodeIfPresent(Bool.self, forKey: .adaptiveGoal) ?? false
    }
}
