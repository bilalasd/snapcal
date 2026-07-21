import Foundation

/// BMR/TDEE estimation (Mifflin-St Jeor) + calorie-target math. Pure
/// functions, ported from packages/shared/src/bmr.ts (source of truth for
/// field names/formulas/constants, read directly, not guessed). Only the
/// subset Phase 2 needs (goal/targets math here; profile/TDEE math for
/// Task 7's ProfileSection) — `suggestedIntake`/`suggestedMacros`/
/// `computeFormulaTdee` aren't ported since nothing in Phase 2 calls them.
struct ActivityLevelOption {
    let value: ActivityLevel
    let label: String
    let description: String
    let multiplier: Double
}

// Labels/descriptions/multipliers verified against bmr.ts's ACTIVITY_LEVELS
// array directly (not the task brief's sample, which had "active"/"very_active"
// swapped relative to source: bmr.ts's `active` entry is labeled "Very active"
// / "Hard exercise 6–7 days/week", and `very_active` is "Extremely active" /
// "Physical job + hard training" — the brief's sample instead read "Active"/
// "Very active" with different description text for the same two cases).
let activityLevels: [ActivityLevelOption] = [
    .init(value: .sedentary, label: "Sedentary", description: "Desk job, little exercise", multiplier: 1.2),
    .init(value: .light, label: "Lightly active", description: "Exercise 1–3 days/week", multiplier: 1.375),
    .init(value: .moderate, label: "Moderately active", description: "Exercise 3–5 days/week", multiplier: 1.55),
    .init(value: .active, label: "Very active", description: "Hard exercise 6–7 days/week", multiplier: 1.725),
    .init(value: .veryActive, label: "Extremely active", description: "Physical job + hard training", multiplier: 1.9),
]

/// Mifflin-St Jeor basal metabolic rate, kcal/day.
func bmrMifflinStJeor(sex: Sex, weightKg: Double, heightCm: Double, age: Int) -> Double {
    let base = 10 * weightKg + 6.25 * heightCm - 5 * Double(age)
    return (base + (sex == .male ? 5 : -161)).rounded()
}

/// Formula-estimated maintenance calories.
func estimatedTdee(bmr: Double, activity: ActivityLevel) -> Double {
    let multiplier = activityLevels.first { $0.value == activity }?.multiplier ?? 1.2
    return (bmr * multiplier).rounded()
}

private let kcalPerKg = 7700.0

/// Daily deficit (positive) or surplus (negative) needed for a kg/week rate.
func deficitForRate(_ targetRateKgPerWk: Double) -> Int {
    Int((-targetRateKgPerWk * kcalPerKg / 7).rounded())
}

struct MacroPercents: Equatable { var proteinPct: Int; var carbsPct: Int; var fatPct: Int }
struct MacroGrams: Equatable { var proteinG: Int; var carbsG: Int; var fatG: Int }

/// Percent of calories each macro target represents (4/4/9 kcal per gram).
func macroPercents(calories: Int, grams: MacroGrams) -> MacroPercents {
    guard calories > 0 else { return .init(proteinPct: 0, carbsPct: 0, fatPct: 0) }
    let protein = Int((Double(grams.proteinG * 4) / Double(calories) * 100).rounded())
    let fat = Int((Double(grams.fatG * 9) / Double(calories) * 100).rounded())
    let carbs = max(0, 100 - protein - fat)
    return .init(proteinPct: protein, carbsPct: carbs, fatPct: fat)
}

/// Gram targets from a percent split of a calorie goal.
func gramsFromPercents(calories: Int, pcts: MacroPercents) -> MacroGrams {
    .init(
        proteinG: Int((Double(calories * pcts.proteinPct) / 100 / 4).rounded()),
        carbsG: Int((Double(calories * pcts.carbsPct) / 100 / 4).rounded()),
        fatG: Int((Double(calories * pcts.fatPct) / 100 / 9).rounded()))
}

// MARK: - Plan math (onboarding)

/// Calorie target for a goal rate, with a safety floor. Ports
/// packages/shared/src/bmr.ts's `suggestedIntake` exactly.
///
/// The floor is the point of this function: an aggressive rate on a small
/// person can compute an intake well under what's safe, so it clamps to the
/// greater of 1200 kcal and 85% of BMR — and reports that it clamped, so the
/// UI can say so rather than silently showing a different number than asked for.
func suggestedIntake(tdee: Double, bmr: Double, targetRateKgPerWk: Double) -> (intake: Int, floored: Bool) {
    let raw = Int(tdee.rounded()) - deficitForRate(targetRateKgPerWk)
    let floor = max(1200, Int((bmr * 0.85).rounded()))
    if raw < floor { return (floor, true) }
    return (raw, false)
}

/// Daily macro targets for a calorie goal. Ports `suggestedMacros`.
///
/// Protein is 1.6 g/kg of bodyweight (evidence-based for active or
/// weight-losing people — enough to preserve muscle), fat is 30% of calories,
/// carbs take the remainder. These are GOALS; a logged meal's macros come from
/// the per-item estimate in /api/analyze, not this formula.
func suggestedMacros(calories: Int, weightKg: Double) -> MacroGrams {
    let protein = Int((1.6 * weightKg).rounded())
    let fat = Int((Double(calories) * 0.3 / 9).rounded())
    let carbs = max(0, Int((Double(calories - protein * 4 - fat * 9) / 4).rounded()))
    return MacroGrams(proteinG: protein, carbsG: carbs, fatG: fat)
}
