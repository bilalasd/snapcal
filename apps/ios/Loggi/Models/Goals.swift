import Foundation

enum ActivityLevel: String, Codable, CaseIterable, Hashable {
    case sedentary, light, moderate, active
    case veryActive = "very_active"

    /// Copy ported verbatim from packages/shared/src/bmr.ts's ACTIVITY_LEVELS
    /// — the descriptions are what make the choice answerable, so they are
    /// part of the model rather than re-invented per screen.
    var label: String {
        switch self {
        case .sedentary: "Sedentary"
        case .light: "Lightly active"
        case .moderate: "Moderately active"
        case .active: "Very active"
        case .veryActive: "Athlete"
        }
    }
    var blurb: String {
        switch self {
        case .sedentary: "Desk job, little deliberate exercise"
        case .light: "Light exercise 1–3 days a week"
        case .moderate: "Moderate exercise 3–5 days a week"
        case .active: "Hard exercise 6–7 days a week"
        case .veryActive: "Physical job or twice-daily training"
        }
    }
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
    /// Memberwise init, written out because the custom `init(from:)` below
    /// suppresses the synthesized one. Onboarding needs to CONSTRUCT a Goals
    /// (it computes a plan before the server has one), not just decode it.
    init(dailyCalories: Int, dailyProteinG: Int, dailyCarbsG: Int, dailyFatG: Int,
         targetRateKgPerWk: Double, unitSystem: UnitSystem, sex: Sex?, age: Int?,
         heightCm: Double?, activityLevel: ActivityLevel?, onboarded: Bool,
         goalWeightKg: Double?, adaptiveGoal: Bool) {
        self.dailyCalories = dailyCalories
        self.dailyProteinG = dailyProteinG
        self.dailyCarbsG = dailyCarbsG
        self.dailyFatG = dailyFatG
        self.targetRateKgPerWk = targetRateKgPerWk
        self.unitSystem = unitSystem
        self.sex = sex
        self.age = age
        self.heightCm = heightCm
        self.activityLevel = activityLevel
        self.onboarded = onboarded
        self.goalWeightKg = goalWeightKg
        self.adaptiveGoal = adaptiveGoal
    }

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

    // Custom encode(to:) — verified necessary 2026-07-20 via a local
    // decode/mutate/re-encode round trip against this exact struct: Swift's
    // default-synthesized Encodable OMITS a nil Optional's key entirely
    // (confirmed output for goalWeightKg = nil had no "goal_weight_kg" key
    // at all). apps/api/src's PUT /api/goals (goalsInput = z.object({...
    // .nullable().optional() ...}), then `...(parsed.data.goal_weight_kg
    // !== undefined && { goalWeightKg: ... })`) treats an ABSENT key as
    // "leave the stored value unchanged" and an explicit `null` as "clear
    // it" — the same distinction settings.tsx's `JSON.stringify(next)`
    // preserves for free (JS always serializes an explicit `null`). Without
    // this override, Settings' own GoalCard "Goal weight (optional)" field,
    // when emptied and saved, would silently fail to clear the value
    // server-side. sex/age/heightCm/activityLevel/goalWeightKg are exactly
    // the fields the API schema marks `.nullable()` (as opposed to
    // onboarded/adaptiveGoal, which are `.optional()` but never nullable —
    // plain booleans, never need this).
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(dailyCalories, forKey: .dailyCalories)
        try c.encode(dailyProteinG, forKey: .dailyProteinG)
        try c.encode(dailyCarbsG, forKey: .dailyCarbsG)
        try c.encode(dailyFatG, forKey: .dailyFatG)
        try c.encode(targetRateKgPerWk, forKey: .targetRateKgPerWk)
        try c.encode(unitSystem, forKey: .unitSystem)
        try c.encode(onboarded, forKey: .onboarded)
        try c.encode(adaptiveGoal, forKey: .adaptiveGoal)
        if let sex { try c.encode(sex, forKey: .sex) } else { try c.encodeNil(forKey: .sex) }
        if let age { try c.encode(age, forKey: .age) } else { try c.encodeNil(forKey: .age) }
        if let heightCm { try c.encode(heightCm, forKey: .heightCm) } else { try c.encodeNil(forKey: .heightCm) }
        if let activityLevel { try c.encode(activityLevel, forKey: .activityLevel) } else { try c.encodeNil(forKey: .activityLevel) }
        if let goalWeightKg { try c.encode(goalWeightKg, forKey: .goalWeightKg) } else { try c.encodeNil(forKey: .goalWeightKg) }
    }
}
