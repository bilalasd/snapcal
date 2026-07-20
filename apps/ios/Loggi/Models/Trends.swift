import Foundation

struct WeightPoint: Codable, Equatable {
    let date: String
    let weightKg: Double
}

struct TrendPoint: Codable, Equatable {
    let date: String
    let weightKg: Double
    let trendKg: Double
}

struct EnergyBalance: Codable, Equatable {
    let avgIntakeKcal: Int
    let tdeeKcal: Int
    let actualDeficitKcal: Int
    let loggedDays: Int
    let weighIns: Int
    let windowDays: Int
}

enum VerdictStatus: String, Codable {
    case collecting
    case onTrack = "on_track"
    case adjust
}

struct Verdict: Codable, Equatable {
    let status: VerdictStatus
    let adjustKcal: Int
    let neededDeficitKcal: Int
    let actualDeficitKcal: Int
    let missing: [String]
}

struct AuditStats: Codable, Equatable {
    let avgIntakeKcal: Int
    let measuredTdeeKcal: Int
    let formulaTdeeKcal: Int
    let driftKcal: Int
}

struct WeeklyRecap: Codable, Equatable {
    let weekStart: String
    let content: String

    enum CodingKeys: String, CodingKey {
        case weekStart = "week_start"
        case content
    }
}

/// GET /api/trends response. Field names verified against
/// packages/shared/src/trend.ts's TrendsResponse (source of truth for the
/// nested types' wire keys, which are camelCase — only the top-level fields
/// are snake_case, per apps/api/src/app/api/trends/route.ts's NextResponse.json
/// call) AND a live authenticated `/api/trends?days=90&tz_offset=0` response
/// fetched 2026-07-20.
///
/// Live-verified correction: the deployed production API's response omits
/// "adaptive_goal_kcal" and "audit" entirely (not present as null — absent
/// keys), same "deployed API lags apps/api/src" situation Phase 1 hit with
/// Goals.adaptive_goal and ApiMeal.planned. No code change was needed here
/// (unlike those two): Swift's synthesized Decodable conformance already
/// treats a missing key as nil for an Optional-typed property, so plain
/// `let adaptiveGoalKcal: Int?` / `let audit: AuditStats?` below decode
/// correctly with no custom init(from:) required. Confirmed by decoding the
/// live response against this exact struct (see task-1-report.md).
struct TrendsResponse: Codable, Equatable {
    let weights: [TrendPoint]
    let rateKgPerWeek: Double?
    let balance: EnergyBalance?
    let verdict: Verdict
    let adaptiveGoalKcal: Int?
    let audit: AuditStats?
    let targetRateKgPerWk: Double
    let goalWeightKg: Double?
    let unitSystem: UnitSystem
    let recap: WeeklyRecap?

    enum CodingKeys: String, CodingKey {
        case weights
        case rateKgPerWeek = "rate_kg_per_week"
        case balance, verdict
        case adaptiveGoalKcal = "adaptive_goal_kcal"
        case audit
        case targetRateKgPerWk = "target_rate_kg_per_wk"
        case goalWeightKg = "goal_weight_kg"
        case unitSystem = "unit_system"
        case recap
    }
}

/// POST /api/weights and GET /api/weights/latest response shape (single
/// manual weigh-in, not the bulk backfill form). Live-verified 2026-07-20
/// against GET /api/weights/latest (POST wasn't exercised — Phase 2's plan
/// keeps API exploration read-only — but both routes return the identical
/// `{ date, weight_kg }` literal in apps/api/src, confirmed by reading
/// apps/api/src/app/api/weights/route.ts and weights/latest/route.ts).
struct WeightLogResult: Codable, Equatable {
    let date: String
    let weightKg: Double

    enum CodingKeys: String, CodingKey {
        case date
        case weightKg = "weight_kg"
    }
}
