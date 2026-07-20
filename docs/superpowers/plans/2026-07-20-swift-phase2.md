# Swift Rewrite Phase 2 — Read Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user who logs nothing gets full daily-use parity: Today (hero card, macros, streaks, milestones, day paging), History (chart + day groups), Weight (trend chart, verdict cards, manual weigh-in logging), and Settings (goal/targets/profile forms, data export, account deletion) — matching the RN app's `apps/mobile/app/(tabs)/*.tsx` screens exactly, since DESIGN.md is binding and this is a port, not a redesign.

**Architecture:** Four SwiftUI screens replace `RootView`'s Phase-1 placeholder inside a `TabView`. Each screen is a thin view over `@Observable` state that mirrors the RN screens' `useState`/cache-read patterns: read the cache synchronously for instant paint, kick a background refetch, reconcile. Two new small pure-Swift ports of `packages/shared`'s pure functions (`bmr.swift`, `trend-format.swift` — trend *math* itself runs server-side via `/api/trends`, so only display-adjacent helpers need a client port) plus new Codable models for `TrendsResponse`. `MealCache` gains the `historyRange`/`trends`/goal-history cache slots Phase 1 deliberately deferred. Swift Charts (`Chart`, `BarMark`, `LineMark`) replaces the hand-rolled RN `<BarChart>`/`<WeightChart>` components.

**Tech Stack:** SwiftUI, Swift Charts (iOS 16+, available at this project's iOS 17 floor), the existing `APIClient`/`MealCache`/Clerk auth from Phase 1 — no new dependencies.

## Global Constraints

- Work in the worktree: `/Users/muhammadbalagamwala/Documents/Projects/2026/SnapCal/.claude/worktrees/swift-rewrite`. Regenerate with `cd apps/ios && xcodegen generate` after any project.yml or file-set change.
- The backend (`apps/api`) must NOT be modified — this phase is a pure client-side port.
- Verify every task on the simulator using a specifically-selected booted UDID (`xcrun simctl list devices booted | grep iPhone | grep -oE '[0-9A-F-]{36}' | head -1`) — never bare `booted`. Build + install + launch + screenshot via `cd apps/ios && bash scripts/dev-loop.sh <path>.png`.
- **DESIGN.md is binding — this is a port, not a redesign** (per AGENTS.md and the approved rewrite spec). Use these exact §2.3/§2.4 tokens throughout, all already in or added to `Theme.swift`:
  - Screen title → `Theme.Typography.headline36` (36px black, §2.3 "Headline")
  - Hero metric ("N CAL LEFT") → **new** `Theme.Typography.bigMetric60` (60px black, tabular — §2.3 "Big metric"; add via Task 1)
  - Kicker/eyebrow → `Theme.Typography.kicker12`
  - Body/label text → `Theme.Typography.body16` / system defaults; captions → `Theme.Typography.caption11` (11px floor, never smaller)
  - Screen gutter / section gap → `Theme.Spacing.l` (20pt)
  - Card padding → `Theme.Spacing.m` (16pt)
  - **Cluster gap (12pt, DESIGN.md §2.4's "Cluster gap" role, inside-card element spacing) → new `Theme.Spacing.cluster`, add via Task 1.** This is completing an already-DESIGN.md-documented spacing role that Phase 0 ported incompletely (flagged, not fixed, in Phase 0's final review) — not inventing a new one, so no AGENTS.md convention-diff-and-wait gate applies; still call this out explicitly in Task 1's commit message since it touches the shared Theme.
  - Inline gap (icon+label, chip rows) → `Theme.Spacing.s` (8pt)
  - Micro gap (label→value) → `Theme.Spacing.xs` (4pt)
  - Shape: cards use `.clipShape(RoundedRectangle(cornerRadius: 24))` (`rounded-3xl`), rows/inputs `cornerRadius: 16` (`rounded-2xl`), chips/segments `Capsule()` (`rounded-full`) — per §2.5.
  - No elevation/shadows — flat surfaces + 1px hairline borders (`Theme.hairline`) per §2.6.
  - Pastel block cards (lime/lilac/cream/mint/coral) always render **fixed black ink** (`Color.black` / `.black.opacity(...)`, never `Theme.foreground`) since they don't track the theme — exactly like the RN app's `MACRO_INK` constant and `text-black` classes.
- Every new Codable model's `CodingKeys`/field names must match the exact JSON field names returned by the real API — **verify against a live authenticated response, not just the TS source**, the same discipline Phase 1 used (which caught two real client/server drift bugs: `adaptive_goal` and `planned` missing from the currently-deployed API). A test session can be minted without a password via Clerk's Backend API sign-in-token flow — see `.superpowers/sdd/progress.md`'s "PHASE 1 EXIT CRITERION" entry for the exact recipe (mint via `CLERK_SECRET_KEY` in the main checkout's `apps/api/.env.development.local`, exchange via `POST https://musical-reindeer-96.clerk.accounts.dev/v1/client/sign_ins?_is_native=1` with `strategy=ticket`). Give every optional-in-practice field the same `decodeIfPresent(...) ?? default` treatment `ApiMeal.planned`/`Goals.adaptiveGoal` already use, rather than assuming the deployed API is fully caught up to `packages/shared/src/types.ts`/`trend.ts`.
- Swift Charts usage is new in this codebase (Phase 0/1 didn't touch it) — implementers should build-verify chart code actually renders (screenshot, don't just trust `** BUILD SUCCEEDED **`) since Charts has real runtime-only failure modes (empty/malformed `Plottable` data silently renders nothing).
- **Deferred to Phase 4 per the approved spec** (these RN Settings cards / Today features touch local notifications, HealthKit, or ImageRenderer — all explicitly Phase 4 "Growth surfaces" items): Monday-note notification toggle, evening-reminder toggle, Apple Health sync card, the Milestone card's "Share it" ImageRenderer button (display the card, skip the share action), the "usual meal" one-tap-log suggestion (it's a *logging* action, Phase 3's territory), Ask Bevi entry point (destination screen doesn't exist until Phase 4), Dinner-out Live Activity. Do not build these now — a stub/missing card here is correct scope, not a gap.
- Commit after each task; trailers: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01LUkoTB1GUfXibmxxhrVQdh`.

---

### Task 1: Trends/Weight models + Theme completions + MealCache history/trends slots

**Files:**
- Create: `apps/ios/Loggi/Models/Trends.swift`
- Modify: `apps/ios/Loggi/Theme/Theme.swift` (add `bigMetric60`, `Spacing.cluster`)
- Modify: `apps/ios/Loggi/State/MealCache.swift` (add `historyRange`/`trends`/goal-history slots)

**Interfaces:**
- Produces: `struct WeightPoint: Codable, Equatable` (`date: String`, `weightKg: Double`), `struct TrendPoint: Codable, Equatable` (adds `trendKg: Double`), `struct EnergyBalance: Codable, Equatable`, `enum VerdictStatus: String, Codable { case collecting, onTrack = "on_track", adjust }`, `struct Verdict: Codable, Equatable`, `struct WeeklyRecap: Codable, Equatable` (`weekStart: String`, `content: String`), `struct TrendsResponse: Codable, Equatable` (mirrors `packages/shared/src/trend.ts`'s `TrendsResponse` field-for-field). `Theme.Typography.bigMetric60`, `Theme.Spacing.cluster`. `MealCache` gains `historyRange: [ApiMeal]?`, `func reconcileRange(_ meals: [ApiMeal]) -> [ApiMeal]`, `func rangeIsFresh() -> Bool`, `trends: TrendsResponse?`, `func setTrends(_ t: TrendsResponse)`, `func goalForDate(_ date: String, fallback: Int) -> Int`, `func recordDailyGoal(_ date: String, kcal: Int)`.
- Consumes: `localDateString`, `parseAPIDate` (Task 1 of Phase 1, `apps/ios/Loggi/Models/ApiMeal.swift`), the existing `Disk` helper in `MealCache.swift`.

- [ ] **Step 1: Write `Trends.swift`**

Field names verified against `packages/shared/src/trend.ts` (`TrendsResponse`, `TrendPoint`, `EnergyBalance`, `Verdict` — read that file directly if any field below looks surprising, it's the source of truth this was transcribed from) and the API's snake_case wire keys (`rate_kg_per_week`, `adaptive_goal_kcal`, etc., confirmed via the same "live authenticated response" pattern Phase 1 used for `Goals`/`ApiMeal` — **do not skip verifying this against a real `/api/trends` response before trusting it**, since `trend.ts`'s `TrendsResponse` was read from source, not confirmed live, when this plan was written):

```swift
import Foundation

struct WeightPoint: Codable, Equatable {
    let date: String
    let weightKg: Double

    enum CodingKeys: String, CodingKey {
        case date
        case weightKg = "weightKg"
    }
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

/// POST /api/weights response shape (single manual weigh-in, not the bulk form).
struct WeightLogResult: Codable, Equatable {
    let date: String
    let weightKg: Double

    enum CodingKeys: String, CodingKey {
        case date
        case weightKg = "weight_kg"
    }
}
```

- [ ] **Step 2: Add the two Theme completions** — in `apps/ios/Loggi/Theme/Theme.swift`, inside `enum Typography`, add below `headline36`:

```swift
        // DESIGN.md §2.3: "text-6xl font-black tracking-tighter" tabular = 60px/black.
        static let bigMetric60 = Font.system(size: 60, weight: .black).width(.standard).monospacedDigit()
```

Inside `enum Spacing`, add the DESIGN.md §2.4 "Cluster gap" role (12pt, inside-card element spacing) that Phase 0 didn't port:

```swift
    enum Spacing {
        static let xs: CGFloat = 4, s: CGFloat = 8, cluster: CGFloat = 12, m: CGFloat = 16, l: CGFloat = 20, xl: CGFloat = 24
    }
```

- [ ] **Step 3: Add history/trends/goal-history slots to `MealCache.swift`** — extend the existing `Snapshot` struct and add new members. Read the current file first (it already has `mealsByDate`/`goals`/`pendingNew`/`pendingDelete`/`hydrate`/`persist` from Phase 1 — do not duplicate or restructure those, only add to them):

```swift
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
```

Also extend `clear()` (the sign-out cache wipe from Phase 1's final review fix) to reset the new state:

```swift
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
```

Note for implementer: `clear()`'s existing body already has this shape from Phase 1 — extend it in place, do not write a second `clear()`.

- [ ] **Step 4: Build** (compile-only; nothing consumes these yet):

```bash
cd apps/ios && xcodegen generate
UDID=$(xcrun simctl list devices booted | grep iPhone | grep -oE '[0-9A-F-]{36}' | head -1)
xcodebuild -project Loggi.xcodeproj -scheme Loggi -configuration Debug -destination "id=$UDID" build | tail -5
```
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Verify `TrendsResponse` decodes a real response** — using the credential-minting recipe in the Global Constraints section (or `.superpowers/sdd/progress.md`'s Phase 1 exit-criterion entry), fetch a real `GET /api/trends?days=90&tz_offset=0` response via curl and decode it with a standalone `swift <script>.swift` snippet against the actual `Trends.swift` file (same technique used to verify `Goals`/`ApiMeal` in Phase 1 — see git commit `2327b28`'s description for the exact method). Fix any field mismatch found (missing/renamed keys, wrong optionality) before moving on — do not guess ahead of time which fields the live API omits.

- [ ] **Step 6: Commit** — `swift: Trends models, Theme spacing/type completions, MealCache history/trends slots`

---

### Task 2: Today — hero card, macros, day paging, streak badges

**Files:**
- Create: `apps/ios/Loggi/Today/TodayView.swift`
- Create: `apps/ios/Loggi/Today/ProgressRing.swift`
- Modify: `apps/ios/Loggi/Navigation/RootView.swift` (host `TodayView` inside the tab shell — see Task 8 for the actual `TabView`; until Task 8 lands, `RootView` can present `TodayView` directly at the root so this task is independently verifiable)

**Interfaces:**
- Consumes: `MealCache.shared`, `APIClient.shared`, `ApiMeal`/`Goals`/`mealTotals`/`localDateString`/`tzOffsetMinutes`/`parseAPIDate` (Phase 1), `Theme.*` (incl. Task 1's `bigMetric60`/`Spacing.cluster`).
- Produces: `TodayView: View`, `ProgressRing: View` (`value: Double, max: Double, label: String, sublabel: String`). Task 3 adds Monday-note/Milestone cards into this same file's body.

- [ ] **Step 1: Write `ProgressRing.swift`** — a Swift Charts-free ring (simple `Circle().trim`), matching the RN `<ProgressRing size="compact">`'s ~72pt compact size:

```swift
import SwiftUI

struct ProgressRing: View {
    let value: Double
    let max: Double
    let label: String
    let sublabel: String

    private var fraction: Double {
        guard max > 0 else { return 0 }
        return min(value / max, 1)
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.black.opacity(0.12), lineWidth: 8)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(Color.black, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text(label).font(.system(size: 15, weight: .black)).foregroundStyle(.black)
                Text(sublabel).font(.system(size: 9, weight: .bold)).foregroundStyle(.black.opacity(0.6))
            }
        }
        .frame(width: 72, height: 72)
        .animation(Theme.Motion.standard, value: fraction)
    }
}
```

- [ ] **Step 2: Write `TodayView.swift`** — this is the core hero/macros/day-nav/journal screen. Streak badges, macro fill bars, meal journal list. Skeleton/empty states match DESIGN.md §4.3. Monday-note and Milestone card slots are left as `EmptyView()` placeholders with a `// Task 3 adds this` comment — Task 3 fills them in, this task must build and render correctly without them:

```swift
import SwiftUI

@Observable
final class TodayViewModel {
    var meals: [ApiMeal]?
    var goals: Goals?
    var date: String
    let today: String
    var streak: Int?
    var daySums: [String: Double] = [:]
    var dayPickerOpen = false

    init() {
        let t = localDateString()
        today = t
        date = t
    }

    var isToday: Bool { date == today }

    func load() async {
        // Match RN's cached ?? null pattern exactly: a cache miss on a
        // freshly-paged-to date must clear the PREVIOUS date's meals, not
        // leave them showing (day-nav would otherwise flash yesterday's
        // journal under today's date until the fetch resolves).
        meals = MealCache.shared.cachedMeals(for: date)
        do {
            let fetched: [ApiMeal] = try await APIClient.shared.get("/api/meals", query: [
                "date": date, "tz_offset": String(tzOffsetMinutes()),
            ])
            meals = MealCache.shared.reconcileMeals(date: date, server: fetched)
        } catch {
            if meals == nil { meals = [] }
        }
    }

    func loadGoals() async {
        if let cached = MealCache.shared.cachedGoals() { goals = cached; return }
        do {
            let g: Goals = try await APIClient.shared.get("/api/goals")
            goals = g
            MealCache.shared.setGoals(g)
        } catch { /* Today's .task retries via the view's onAppear on next focus */ }
    }

    /// Trailing-7-day streak + per-day totals, from the cached 30-day range
    /// when warm (History/prior loads keep it fresh), else a dedicated fetch.
    func loadStreak() async {
        let weekAgo = Date().addingTimeInterval(-6 * 86_400)
        func count(_ rows: [ApiMeal]) {
            var sums: [String: Double] = [:]
            for m in rows {
                guard !m.planned, let eaten = parseAPIDate(m.eatenAt), eaten >= weekAgo else { continue }
                let d = localDateString(eaten)
                sums[d, default: 0] += mealTotals(m).calories
            }
            daySums = sums
            streak = min(sums.count, 7)
        }
        if let cached = MealCache.shared.historyRange {
            count(cached)
        } else {
            do {
                let rows: [ApiMeal] = try await APIClient.shared.get("/api/meals", query: [
                    "from": ISO8601DateFormatter().string(from: weekAgo),
                    "to": ISO8601DateFormatter().string(from: Date()),
                ])
                count(rows)
            } catch { /* streak just stays nil — non-critical */ }
        }
    }

    func goPrev() {
        date = TodayViewModel.addDays(date, -1)
    }
    func goNext() {
        guard date < today else { return }
        date = TodayViewModel.addDays(date, 1)
        meals = nil
    }

    static func addDays(_ date: String, _ days: Int) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = .current
        guard let d = f.date(from: date) else { return date }
        let next = Calendar(identifier: .gregorian).date(byAdding: .day, value: days, to: d) ?? d
        return f.string(from: next)
    }
}

struct TodayView: View {
    @State private var vm = TodayViewModel()

    private var totals: (calories: Double, protein: Double, carbs: Double, fat: Double) {
        (vm.meals ?? []).filter { !$0.planned }.reduce((0.0, 0.0, 0.0, 0.0)) { acc, meal in
            let t = mealTotals(meal)
            return (acc.0 + t.calories, acc.1 + t.protein, acc.2 + t.carbs, acc.3 + t.fat)
        }
    }
    private var reserved: Double {
        (vm.meals ?? []).filter(\.planned).reduce(0) { $0 + mealTotals($1).calories }
    }
    private var dailyGoal: Double { Double(vm.goals?.dailyCalories ?? 0) }
    private var remaining: Double { (vm.goals == nil) ? 0 : dailyGoal - totals.calories - reserved }
    private var onTarget: Int {
        guard let goals = vm.goals else { return 0 }
        return vm.daySums.filter { date, calories in
            date != vm.today && calories > 0 && calories <= Double(MealCache.shared.goalForDate(date, fallback: goals.dailyCalories))
        }.count
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                header
                dayNav
                if vm.meals == nil || vm.goals == nil {
                    skeleton
                } else {
                    // Task 3 inserts the Monday-note and Milestone cards here.
                    heroCard
                    if vm.meals!.isEmpty {
                        emptyState
                    } else {
                        mealJournal
                    }
                }
            }
            .padding(Theme.Spacing.l)
            .padding(.bottom, 96)
        }
        .background(Theme.background)
        .task {
            MealCache.shared.hydrate()
            SaveQueue.shared.hydrate()
            async let m: () = vm.load()
            async let g: () = vm.loadGoals()
            async let s: () = vm.loadStreak()
            _ = await (m, g, s)
        }
        .onChange(of: vm.date) { _, _ in Task { await vm.load() } }
        .onChange(of: dailyGoal) { _, newValue in
            if newValue > 0 { MealCache.shared.recordDailyGoal(vm.today, kcal: Int(newValue)) }
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text(vm.isToday ? "Today" : vm.date)
                    .font(Theme.Typography.kicker12).foregroundStyle(Theme.mutedForeground)
                Text(vm.isToday ? greeting() : vm.date)
                    .font(Theme.Typography.headline36).foregroundStyle(Theme.foreground)
            }
            Spacer()
            if vm.isToday, let streak = vm.streak, streak > 0 {
                VStack(alignment: .trailing, spacing: Theme.Spacing.xs) {
                    Label("\(streak)/7", systemImage: "bolt.fill")
                        .font(.system(size: 12, weight: .bold))
                        .padding(.horizontal, Theme.Spacing.s).padding(.vertical, 4)
                        .background(Theme.accentLog).clipShape(Capsule())
                        .foregroundStyle(.black)
                    if onTarget > 0 {
                        Label("\(onTarget) on target", systemImage: "checkmark")
                            .font(.system(size: 12, weight: .bold))
                            .padding(.horizontal, Theme.Spacing.s).padding(.vertical, 4)
                            .background(Theme.blockMint).clipShape(Capsule())
                            .foregroundStyle(.black)
                    }
                }
            }
        }
    }

    private var dayNav: some View {
        HStack {
            Button(action: vm.goPrev) { Image(systemName: "chevron.left") }
                .frame(width: 44, height: 44)
            Spacer()
            Text(vm.isToday ? "TODAY" : vm.date.uppercased())
                .font(.system(size: 11, weight: .heavy)).foregroundStyle(Theme.mutedForeground)
            Spacer()
            Button(action: vm.goNext) { Image(systemName: "chevron.right") }
                .frame(width: 44, height: 44)
                .disabled(vm.isToday)
        }
        .overlay(Rectangle().fill(Theme.hairline).frame(height: 1), alignment: .top)
        .padding(.top, Theme.Spacing.s)
    }

    private var skeleton: some View {
        VStack(spacing: Theme.Spacing.m) {
            Circle().fill(Theme.muted).frame(width: 208, height: 208)
            RoundedRectangle(cornerRadius: 16).fill(Theme.muted).frame(height: 96)
        }
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text(remaining >= 0 ? "Still available" : "Over target")
                        .font(Theme.Typography.kicker12).foregroundStyle(.black.opacity(0.6))
                    Text("\(Int(abs(remaining)))")
                        .font(Theme.Typography.bigMetric60)
                        .foregroundStyle(remaining < 0 ? Theme.destructive : .black)
                    Text("cal \(remaining >= 0 ? "left" : "over")")
                        .font(.system(size: 13, weight: .bold)).foregroundStyle(.black.opacity(0.6))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(Int(totals.calories)) of \(Int(dailyGoal)) eaten")
                            .font(.system(size: 12, weight: .semibold)).foregroundStyle(.black.opacity(0.6))
                        if reserved > 0 {
                            Text("\(Int(reserved)) reserved for later")
                                .font(.system(size: 12, weight: .semibold)).foregroundStyle(.black.opacity(0.6))
                        }
                    }
                    .padding(.top, Theme.Spacing.s)
                }
                Spacer()
                ProgressRing(value: totals.calories, max: dailyGoal, label: "\(dailyGoal > 0 ? Int(min(totals.calories / dailyGoal * 100, 999)) : 0)%", sublabel: "logged")
            }
            VStack(spacing: Theme.Spacing.cluster) {
                macroRow("Protein", totals.protein, Double(vm.goals?.dailyProteinG ?? 0), Color.black)
                macroRow("Carbs", totals.carbs, Double(vm.goals?.dailyCarbsG ?? 0), Color.black.opacity(0.7))
                macroRow("Fat", totals.fat, Double(vm.goals?.dailyFatG ?? 0), Color.black.opacity(0.5))
            }
            .padding(.top, Theme.Spacing.m)
            .overlay(Rectangle().fill(Color.black.opacity(0.15)).frame(height: 1), alignment: .top)
        }
        .padding(Theme.Spacing.m)
        .background(Theme.blockLime)
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private func macroRow(_ label: String, _ value: Double, _ max: Double, _ color: Color) -> some View {
        HStack(spacing: Theme.Spacing.cluster) {
            Text(label.uppercased()).font(.system(size: 11, weight: .heavy)).foregroundStyle(.black).frame(width: 72, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle().fill(Color.black.opacity(0.1))
                    Rectangle().fill(color).frame(width: max > 0 ? geo.size.width * min(value / max, 1) : 0)
                }
            }
            .frame(height: 8)
            .animation(Theme.Motion.standard, value: value)
            Text("\(Int(value))/\(Int(max))g")
                .font(.system(size: 11, weight: .bold)).foregroundStyle(.black.opacity(0.6))
                .frame(width: 80, alignment: .trailing)
        }
    }

    private var emptyState: some View {
        VStack(spacing: Theme.Spacing.cluster) {
            Text(vm.isToday ? "Nothing logged yet" : "No meals this day")
                .font(.system(size: 18, weight: .black)).foregroundStyle(Theme.foreground)
            Text(vm.isToday ? "Snap a photo of your next meal to get started." : "Add a meal to log it for this day.")
                .font(Theme.Typography.body16).foregroundStyle(Theme.mutedForeground)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(32)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private var mealJournal: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.cluster) {
            Text("MEAL JOURNAL").font(.system(size: 11, weight: .heavy)).foregroundStyle(Theme.mutedForeground)
                .overlay(Rectangle().fill(Theme.hairline).frame(height: 1), alignment: .top)
                .padding(.top, Theme.Spacing.s)
            ForEach(vm.meals ?? []) { meal in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(meal.name).font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.foreground)
                        Text("\(Int(mealTotals(meal).calories)) cal").font(Theme.Typography.caption11).foregroundStyle(Theme.mutedForeground)
                    }
                    Spacer()
                }
                .padding(Theme.Spacing.m)
                .background(Theme.card)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
        }
    }

    private func greeting() -> String {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour < 5 { return "Late night snack?" }
        if hour < 12 { return "Good morning" }
        if hour < 17 { return "Good afternoon" }
        return "Good evening"
    }
}
```

Note for implementer: `MealListItem`'s full RN richness (photo thumbnail, tap-to-open drawer with edit/delete) is Phase 3 territory (drawer edit/delete is a *logging* mutation) — this task's `mealJournal` row is intentionally read-only and simpler; do not build the drawer here.

- [ ] **Step 3: Wire `RootView.swift` to show `TodayView`** — replace the Phase 1 placeholder body with `TodayView()` (keep any DEBUG-only scaffolding from Phase 0 only if still referenced elsewhere; otherwise this task's `TodayView` fully replaces the placeholder body).

- [ ] **Step 4: Verify on simulator** — build, install, launch, screenshot via `dev-loop.sh`. Expected: signed-out shows the sign-in screen unchanged (AuthGate still gates); if a real session is available via the credential-minting recipe, confirm the hero card renders with real numbers, day-nav arrows work, and the empty state shows correctly for an account with no meals today.

- [ ] **Step 5: Commit** — `swift: Today screen (hero card, macros, day paging, streak badges)`

---

### Task 3: Today — Monday note + Milestone display cards

**Files:**
- Create: `apps/ios/Loggi/Today/MondayNoteCard.swift`
- Create: `apps/ios/Loggi/Today/MilestoneCard.swift`
- Modify: `apps/ios/Loggi/Today/TodayView.swift` (fill the Task 2 placeholder slot, fetch trends)

**Interfaces:**
- Consumes: `TrendsResponse` (Task 1), `TodayViewModel` (Task 2).
- Produces: `MondayNoteCard: View`, `MilestoneCard: View` (display-only — no share action, per Global Constraints' Phase 4 deferral).

- [ ] **Step 1: Write `MondayNoteCard.swift`** — lilac card, shown only on Today (not past days) when `trends.recap` exists:

```swift
import SwiftUI

struct MondayNoteCard: View {
    let recap: WeeklyRecap
    let verdictStatus: VerdictStatus

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text("Weekly recap").font(.system(size: 20, weight: .black)).foregroundStyle(.black)
            Text("Week of \(recap.weekStart)").font(Theme.Typography.caption11).foregroundStyle(.black.opacity(0.6))
            Text(recap.content).font(.system(size: 14)).foregroundStyle(.black)
                .padding(.top, Theme.Spacing.xs)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.m)
        .background(Theme.blockCoral)
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }
}
```

- [ ] **Step 2: Write `MilestoneCard.swift`** — a minimal, generic display card (the RN version detects specific milestone types via `lib/milestones.ts`'s streak/verdict/weigh-in logic; Phase 2 shows the card shape using data already in hand from `TrendsResponse`'s `verdict`, deferring the full milestone-detection engine — which depends on locally-persisted "seen" state via `AsyncStorage`, itself a Phase 3+ concern once real logging exists — to when Phase 3's logging makes milestones actually reachable in this client):

```swift
import SwiftUI

struct MilestoneCard: View {
    let title: String
    let subtitle: String
    var onDismiss: () -> Void

    var body: some View {
        HStack(spacing: Theme.Spacing.cluster) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 18, weight: .black)).foregroundStyle(.black)
                Text(subtitle).font(Theme.Typography.caption11).foregroundStyle(.black.opacity(0.7))
            }
            Spacer()
            Button("Nice", action: onDismiss)
                .font(.system(size: 13, weight: .bold))
                .padding(.horizontal, Theme.Spacing.s).padding(.vertical, Theme.Spacing.xs)
                .background(.black).foregroundStyle(.white).clipShape(Capsule())
        }
        .padding(Theme.Spacing.m)
        .background(Theme.blockLime)
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }
}
```
Note for implementer: since full milestone detection is deferred (see above), this task does NOT need to wire `MilestoneCard` into `TodayView`'s body yet — write the component (so Task type-checks and a future phase can wire it without re-designing it), but leave `TodayView`'s milestone slot as `EmptyView()` still. Document this explicitly as a known, deliberate gap in the task report — do not silently skip it without saying so.

- [ ] **Step 3: Wire `MondayNoteCard` + trends fetch into `TodayView.swift`** — add a `trends: TrendsResponse?` property to `TodayViewModel`, a `loadTrends()` method fetching `GET /api/trends?days=90&tz_offset=<tzOffsetMinutes()>` and calling `MealCache.shared.setTrends(_:)`, call it from the view's `.task` alongside the existing three loads, and render `MondayNoteCard` above `heroCard` when `vm.isToday && vm.trends?.recap != nil`:

```swift
// Added to TodayViewModel:
var trends: TrendsResponse?

func loadTrends() async {
    if let cached = MealCache.shared.trends { trends = cached }
    do {
        let t: TrendsResponse = try await APIClient.shared.get("/api/trends", query: [
            "days": "90", "tz_offset": String(tzOffsetMinutes()),
        ])
        trends = t
        MealCache.shared.setTrends(t)
    } catch { /* Today degrades gracefully without trends — no smart goal, no recap */ }
}
```
```swift
// TodayView.body's .task block gains a fourth concurrent load:
.task {
    MealCache.shared.hydrate()
    SaveQueue.shared.hydrate()
    async let m: () = vm.load()
    async let g: () = vm.loadGoals()
    async let s: () = vm.loadStreak()
    async let t: () = vm.loadTrends()
    _ = await (m, g, s, t)
}
```
```swift
// Inside body, replacing the "// Task 3 inserts..." comment:
if vm.isToday, let recap = vm.trends?.recap {
    MondayNoteCard(recap: recap, verdictStatus: vm.trends?.verdict.status ?? .collecting)
}
```

Also wire the smart-goal read: `dailyGoal` should prefer `trends.adaptiveGoalKcal` when `goals.adaptiveGoal` is true, matching the RN app's `trendGoal` logic exactly:

```swift
// Replace TodayView's existing `dailyGoal` computed property with:
private var dailyGoal: Double {
    if vm.goals?.adaptiveGoal == true, let adaptive = vm.trends?.adaptiveGoalKcal {
        return Double(adaptive)
    }
    return Double(vm.goals?.dailyCalories ?? 0)
}
```

- [ ] **Step 4: Verify on simulator** — build, install, launch, screenshot. Confirm no crash whether or not `trends` loads successfully (e.g. a brand-new account with no weigh-ins has `recap: null` — the card must not render, not crash on a force-unwrap).

- [ ] **Step 5: Commit** — `swift: Today Monday-note card + trends-driven smart goal`

---

### Task 4: History screen

**Files:**
- Create: `apps/ios/Loggi/History/HistoryView.swift`
- Create: `apps/ios/Loggi/History/CalorieBarChart.swift`

**Interfaces:**
- Consumes: `MealCache.shared` (`historyRange`, `reconcileRange`, `rangeIsFresh`, `goalForDate`), `APIClient.shared`, `ApiMeal`/`Goals`/`mealTotals`/`localDateString`, `Theme.*`.
- Produces: `HistoryView: View`, `CalorieBarChart: View` (`data: [(label: String, calories: Double)], goal: Double?`).

- [ ] **Step 1: Write `CalorieBarChart.swift`** using Swift Charts:

```swift
import SwiftUI
import Charts

struct CalorieBarChart: View {
    struct Point: Identifiable {
        let id = UUID()
        let label: String
        let calories: Double
    }
    let data: [Point]
    let goal: Double?

    var body: some View {
        Chart {
            ForEach(data) { point in
                BarMark(x: .value("Day", point.label), y: .value("Calories", point.calories))
                    .foregroundStyle(Color.black.opacity(0.75))
                    .cornerRadius(3)
            }
            if let goal {
                RuleMark(y: .value("Goal", goal))
                    .foregroundStyle(Color.black.opacity(0.4))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
            }
        }
        .chartYAxis(.hidden)
        .chartXAxis {
            AxisMarks { _ in
                AxisValueLabel().font(.system(size: 9, weight: .semibold)).foregroundStyle(Color.black.opacity(0.5))
            }
        }
        .frame(height: 140)
    }
}
```

- [ ] **Step 2: Write `HistoryView.swift`** — 7d/30d toggle, day-group cards, expand/collapse per day:

```swift
import SwiftUI

@Observable
final class HistoryViewModel {
    var meals: [ApiMeal]?
    var goals: Goals?
    var range: Int = 7
    var expandedDate: String?
    var failed = false

    func load(force: Bool = false) async {
        if let cached = MealCache.shared.historyRange { meals = cached }
        if !force, MealCache.shared.historyRange != nil, MealCache.shared.rangeIsFresh() { return }
        do {
            let now = Date()
            let from = now.addingTimeInterval(-30 * 86_400)
            let rows: [ApiMeal] = try await APIClient.shared.get("/api/meals", query: [
                "from": ISO8601DateFormatter().string(from: from),
                "to": ISO8601DateFormatter().string(from: now),
            ])
            meals = MealCache.shared.reconcileRange(rows)
            failed = false
        } catch {
            failed = true
        }
    }

    func loadGoals() async {
        if let cached = MealCache.shared.cachedGoals() { goals = cached; return }
        if let g = try? await APIClient.shared.get("/api/goals") as Goals {
            goals = g
            MealCache.shared.setGoals(g)
        }
    }

    struct DayGroup: Identifiable {
        var id: String { date }
        let date: String
        let meals: [ApiMeal]
        let calories: Double
    }

    var days: [DayGroup] {
        var groups: [String: [ApiMeal]] = [:]
        for meal in meals ?? [] {
            guard let eaten = parseAPIDate(meal.eatenAt) else { continue }
            groups[localDateString(eaten), default: []].append(meal)
        }
        return groups.map { date, dayMeals in
            DayGroup(date: date, meals: dayMeals,
                      calories: dayMeals.filter { !$0.planned }.reduce(0) { $0 + mealTotals($1).calories })
        }.sorted { $0.date > $1.date }
    }
}

struct HistoryView: View {
    @State private var vm = HistoryViewModel()

    private var chartData: [CalorieBarChart.Point] {
        let today = localDateString()
        let byDate = Dictionary(uniqueKeysWithValues: vm.days.map { ($0.date, $0.calories) })
        var points: [CalorieBarChart.Point] = []
        for i in stride(from: vm.range - 1, through: 0, by: -1) {
            let d = TodayViewModel.addDays(today, -i)
            let label = String(d.suffix(5))
            points.append(.init(label: label, calories: byDate[d] ?? 0))
        }
        return points
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text("Archive").font(Theme.Typography.kicker12).foregroundStyle(Theme.mutedForeground)
                    Text("History").font(Theme.Typography.headline36).foregroundStyle(Theme.foreground)
                }

                if vm.meals == nil {
                    RoundedRectangle(cornerRadius: 24).fill(Theme.muted).frame(height: 192)
                } else if vm.days.isEmpty {
                    emptyState
                } else {
                    chartCard
                    ForEach(vm.days) { day in
                        dayCard(day)
                    }
                }
            }
            .padding(Theme.Spacing.l)
            .padding(.bottom, 96)
        }
        .background(Theme.background)
        .task {
            async let m: () = vm.load()
            async let g: () = vm.loadGoals()
            _ = await (m, g)
        }
    }

    private var emptyState: some View {
        VStack(spacing: Theme.Spacing.cluster) {
            Text("No meals yet").font(.system(size: 18, weight: .black)).foregroundStyle(Theme.foreground)
            Text("Your logged days — and a calorie chart — show up here once you log a meal.")
                .font(Theme.Typography.body16).foregroundStyle(Theme.mutedForeground).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(32).background(Theme.card).clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private var chartCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text("Plate index").font(Theme.Typography.kicker12).foregroundStyle(.black.opacity(0.6))
                    Text("Calories").font(.system(size: 22, weight: .black)).foregroundStyle(.black)
                }
                Spacer()
                Picker("Range", selection: $vm.range) {
                    Text("7d").tag(7)
                    Text("30d").tag(30)
                }
                .pickerStyle(.segmented)
                .frame(width: 120)
            }
            CalorieBarChart(data: chartData, goal: vm.goals.map { Double($0.dailyCalories) })
            if let goal = vm.goals?.dailyCalories {
                Text("Goal \(goal) cal").font(Theme.Typography.caption11).foregroundStyle(.black.opacity(0.6))
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .padding(Theme.Spacing.m).background(Theme.blockLilac).clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private func dayCard(_ day: HistoryViewModel.DayGroup) -> some View {
        let isOpen = vm.expandedDate == day.date
        let overGoal = vm.goals != nil && day.calories > Double(MealCache.shared.goalForDate(day.date, fallback: vm.goals!.dailyCalories))
        return VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Button {
                vm.expandedDate = isOpen ? nil : day.date
            } label: {
                HStack {
                    Text(day.date).font(.system(size: 17, weight: .black)).foregroundStyle(Theme.foreground)
                    Spacer()
                    Text("\(Int(day.calories)) cal")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(overGoal ? Theme.destructive : Theme.foreground)
                    Image(systemName: isOpen ? "chevron.up" : "chevron.down").foregroundStyle(Theme.mutedForeground)
                }
                .frame(minHeight: 44)
            }
            if isOpen {
                ForEach(day.meals) { meal in
                    HStack {
                        Text(meal.name).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.foreground)
                        Spacer()
                        Text("\(Int(mealTotals(meal).calories)) cal").font(Theme.Typography.caption11).foregroundStyle(Theme.mutedForeground)
                    }
                }
            }
        }
        .padding(Theme.Spacing.m).background(Theme.card).clipShape(RoundedRectangle(cornerRadius: 24))
    }
}
```

- [ ] **Step 3: Wire into the tab shell** — Task 8 adds the actual `TabView`; until then, this task's own verification (Step 4) can present `HistoryView()` temporarily from `RootView` (same pattern Task 2 used) to screenshot it standalone. Task 8 removes any temporary wiring.

- [ ] **Step 4: Verify on simulator** — build, install, launch, screenshot. Confirm empty-state renders correctly for a no-meals account (the credential-minting recipe's test account has none, so this is the realistically-testable path without fabricating data).

- [ ] **Step 5: Commit** — `swift: History screen (calorie chart, day groups)`

---

### Task 5: Weight screen — chart, stats, verdict cards

**Files:**
- Create: `apps/ios/Loggi/Weight/WeightView.swift`
- Create: `apps/ios/Loggi/Weight/WeightTrendChart.swift`

**Interfaces:**
- Consumes: `TrendsResponse`/`WeightLogResult` (Task 1), `APIClient.shared`, `MealCache.shared`, `Theme.*`.
- Produces: `WeightView: View`, `WeightTrendChart: View` (`points: [(measured: Double, trend: Double, label: String)], goal: Double?`).

- [ ] **Step 1: Write `WeightTrendChart.swift`**:

```swift
import SwiftUI
import Charts

struct WeightTrendChart: View {
    struct Point: Identifiable {
        let id = UUID()
        let label: String
        let measured: Double
        let trend: Double
    }
    let points: [Point]
    let goal: Double?

    var body: some View {
        Chart {
            ForEach(points) { p in
                PointMark(x: .value("Day", p.label), y: .value("Weight", p.measured))
                    .foregroundStyle(Color.black.opacity(0.35))
                    .symbolSize(20)
                LineMark(x: .value("Day", p.label), y: .value("Trend", p.trend))
                    .foregroundStyle(Color.black)
                    .interpolationMethod(.catmullRom)
                    .lineStyle(StrokeStyle(lineWidth: 2))
            }
            if let goal {
                RuleMark(y: .value("Goal", goal))
                    .foregroundStyle(Color.black.opacity(0.4))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
            }
        }
        .chartXAxis {
            AxisMarks { _ in AxisValueLabel().font(.system(size: 9, weight: .semibold)).foregroundStyle(Color.black.opacity(0.5)) }
        }
        .chartYAxis {
            AxisMarks { _ in AxisValueLabel().font(.system(size: 9, weight: .semibold)).foregroundStyle(Color.black.opacity(0.5)) }
        }
        .frame(height: 200)
    }
}
```

- [ ] **Step 2: Write `WeightView.swift`** — includes a simple log-weight sheet (manual entry only; Apple Health sync is deferred to Phase 4 per Global Constraints):

```swift
import SwiftUI

private let kgPerLb = 0.453592

@Observable
final class WeightViewModel {
    var data: TrendsResponse?
    var range = 30
    var errorMessage: String?
    var logSheetOpen = false

    func load() async {
        if let cached = MealCache.shared.trends { data = cached }
        do {
            let t: TrendsResponse = try await APIClient.shared.get("/api/trends", query: [
                "days": "90", "tz_offset": String(tzOffsetMinutes()),
            ])
            data = t
            MealCache.shared.setTrends(t)
            errorMessage = nil
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Failed to load trends"
        }
    }

    func logWeight(kg: Double) async -> Bool {
        struct Body: Encodable { let weight_kg: Double }
        do {
            let _: WeightLogResult = try await APIClient.shared.post("/api/weights", body: Body(weight_kg: kg))
            await load()
            return true
        } catch {
            return false
        }
    }
}

struct WeightView: View {
    @State private var vm = WeightViewModel()

    private var imperial: Bool { vm.data?.unitSystem == .imperial }
    private var unit: String { imperial ? "lbs" : "kg" }
    private func toUnit(_ kg: Double) -> Double { imperial ? kg / kgPerLb : kg }
    private var latest: TrendPoint? { vm.data?.weights.last }
    private var rangeCutoff: String { TodayViewModel.addDays(localDateString(), -30) }
    private var chartWeights: [TrendPoint] {
        guard let weights = vm.data?.weights else { return [] }
        return vm.range == 30 ? weights.filter { $0.date >= rangeCutoff } : weights
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                header
                if let err = vm.errorMessage {
                    Text(err).font(Theme.Typography.caption11).foregroundStyle(Theme.destructive)
                }
                if vm.data == nil {
                    RoundedRectangle(cornerRadius: 24).fill(Theme.muted).frame(height: 288)
                } else if let data = vm.data {
                    if data.weights.isEmpty {
                        emptyState
                    } else {
                        chartCard(data)
                    }
                    statsRow(data)
                    verdictCard(data.verdict)
                }
            }
            .padding(Theme.Spacing.l)
            .padding(.bottom, 96)
        }
        .background(Theme.background)
        .task { await vm.load() }
        .sheet(isPresented: $vm.logSheetOpen) {
            LogWeightSheet(imperial: imperial) { kg in
                let ok = await vm.logWeight(kg: kg)
                if ok { vm.logSheetOpen = false }
                return ok
            }
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text("Trend desk").font(Theme.Typography.kicker12).foregroundStyle(Theme.mutedForeground)
                Text("Weight").font(Theme.Typography.headline36).foregroundStyle(Theme.foreground)
            }
            Spacer()
            Button("Log") { vm.logSheetOpen = true }
                .font(.system(size: 14, weight: .bold))
                .padding(.horizontal, Theme.Spacing.m).padding(.vertical, Theme.Spacing.s)
                .background(Theme.primaryFill).foregroundStyle(Theme.primaryText).clipShape(Capsule())
        }
    }

    private var emptyState: some View {
        VStack(spacing: Theme.Spacing.cluster) {
            Text("No weight data yet").font(.system(size: 18, weight: .black)).foregroundStyle(Theme.foreground)
            Text("Tap Log above to add a weigh-in.")
                .font(Theme.Typography.body16).foregroundStyle(Theme.mutedForeground).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(32).background(Theme.card).clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private func chartCard(_ data: TrendsResponse) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text("Latest weigh-in").font(Theme.Typography.kicker12).foregroundStyle(.black.opacity(0.6))
                    if let latest {
                        Text("\(String(format: "%.1f", toUnit(latest.weightKg))) \(unit)")
                            .font(.system(size: 40, weight: .black)).foregroundStyle(.black)
                    }
                }
                Spacer()
                Picker("Range", selection: $vm.range) {
                    Text("30d").tag(30)
                    Text("90d").tag(90)
                }
                .pickerStyle(.segmented).frame(width: 120)
            }
            WeightTrendChart(
                points: chartWeights.map { .init(label: String($0.date.suffix(5)), measured: toUnit($0.weightKg), trend: toUnit($0.trendKg)) },
                goal: data.goalWeightKg.map(toUnit))
        }
        .padding(Theme.Spacing.m).background(Theme.blockCream).clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private func statsRow(_ data: TrendsResponse) -> some View {
        HStack(spacing: Theme.Spacing.cluster) {
            statCard("Current rate", data.rateKgPerWeek.map { "\($0 > 0 ? "+" : "")\(String(format: "%.2f", toUnit($0))) \(unit)/wk" } ?? "—")
            statCard("Maintenance", data.balance.map { "\($0.tdeeKcal) cal" } ?? "—")
        }
    }

    private func statCard(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(Theme.Typography.caption11).foregroundStyle(Theme.mutedForeground)
            Text(value).font(.system(size: 20, weight: .black)).foregroundStyle(Theme.foreground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.m).background(Theme.card).clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private func verdictCard(_ verdict: Verdict) -> some View {
        let (icon, title, body): (String, String, String) = {
            switch verdict.status {
            case .collecting:
                return ("clock", "Collecting data", "The deficit verdict needs consistent logging first. Still needed: \(verdict.missing.joined(separator: ", ")).")
            case .onTrack:
                return ("checkmark.circle", "On track", "You're averaging a \(abs(verdict.actualDeficitKcal)) cal/day \(verdict.actualDeficitKcal >= 0 ? "deficit" : "surplus").")
            case .adjust:
                return ("exclamationmark.triangle", "Adjust intake", "Eat about \(abs(verdict.adjustKcal)) cal/day \(verdict.adjustKcal > 0 ? "less" : "more") to hit your target.")
            }
        }()
        return HStack(alignment: .top, spacing: Theme.Spacing.cluster) {
            Image(systemName: icon).foregroundStyle(Theme.foreground)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 15, weight: .black)).foregroundStyle(Theme.foreground)
                Text(body).font(Theme.Typography.caption11).foregroundStyle(Theme.mutedForeground)
            }
        }
        .padding(Theme.Spacing.m).background(Theme.muted).clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct LogWeightSheet: View {
    let imperial: Bool
    var onSave: (Double) async -> Bool
    @State private var text = ""
    @State private var saving = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: Theme.Spacing.m) {
                TextField(imperial ? "Weight (lbs)" : "Weight (kg)", text: $text)
                    .keyboardType(.decimalPad)
                    .padding(Theme.Spacing.s).background(Theme.muted).clipShape(RoundedRectangle(cornerRadius: 16))
                Button(saving ? "Saving…" : "Save") {
                    guard let v = Double(text), v > 0 else { return }
                    let kg = imperial ? v * kgPerLb : v
                    Task {
                        saving = true
                        _ = await onSave(kg)
                        saving = false
                    }
                }
                .disabled(saving || Double(text) == nil)
            }
            .padding(Theme.Spacing.l)
            .navigationTitle("Log weight")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}
```

- [ ] **Step 3: Verify on simulator** — build, install, launch, screenshot (temporarily present `WeightView()` from `RootView` for standalone verification, same pattern as Tasks 2/4; Task 8 wires the real tab).

- [ ] **Step 4: Commit** — `swift: Weight screen (trend chart, verdict cards, manual weigh-in)`

---

### Task 6: Settings — Goal, Targets, Smart-goal, Units cards

**Files:**
- Create: `apps/ios/Loggi/Settings/SettingsView.swift`
- Create: `apps/ios/Loggi/Settings/Bmr.swift`

**Interfaces:**
- Consumes: `Goals`, `APIClient.shared`, `MealCache.shared`, `Theme.*`.
- Produces: `SettingsView: View` (Task 7 extends this same file with `ProfileSection`; Task 8's data-export/account-actions are also appended here).

- [ ] **Step 1: Write `Bmr.swift`** — port of `packages/shared/src/bmr.ts`'s pure functions needed for the profile/targets math (field names/formula verified against that file directly):

```swift
import Foundation

struct ActivityLevelOption {
    let value: ActivityLevel
    let label: String
    let description: String
    let multiplier: Double
}

let activityLevels: [ActivityLevelOption] = [
    .init(value: .sedentary, label: "Sedentary", description: "Desk job, little exercise", multiplier: 1.2),
    .init(value: .light, label: "Lightly active", description: "Exercise 1–3 days/week", multiplier: 1.375),
    .init(value: .moderate, label: "Moderately active", description: "Exercise 3–5 days/week", multiplier: 1.55),
    .init(value: .active, label: "Active", description: "Exercise 6–7 days/week", multiplier: 1.725),
    .init(value: .veryActive, label: "Very active", description: "Hard exercise daily", multiplier: 1.9),
]

func bmrMifflinStJeor(sex: Sex, weightKg: Double, heightCm: Double, age: Int) -> Double {
    let base = 10 * weightKg + 6.25 * heightCm - 5 * Double(age)
    return (base + (sex == .male ? 5 : -161)).rounded()
}

func estimatedTdee(bmr: Double, activity: ActivityLevel) -> Double {
    let multiplier = activityLevels.first { $0.value == activity }?.multiplier ?? 1.2
    return (bmr * multiplier).rounded()
}

func deficitForRate(_ targetRateKgPerWk: Double) -> Int {
    Int((-targetRateKgPerWk * 7700 / 7).rounded())
}

struct MacroPercents { var proteinPct: Int; var carbsPct: Int; var fatPct: Int }
struct MacroGrams { var proteinG: Int; var carbsG: Int; var fatG: Int }

func macroPercents(calories: Int, grams: MacroGrams) -> MacroPercents {
    guard calories > 0 else { return .init(proteinPct: 0, carbsPct: 0, fatPct: 0) }
    let protein = Int((Double(grams.proteinG * 4) / Double(calories) * 100).rounded())
    let fat = Int((Double(grams.fatG * 9) / Double(calories) * 100).rounded())
    let carbs = max(0, 100 - protein - fat)
    return .init(proteinPct: protein, carbsPct: carbs, fatPct: fat)
}

func gramsFromPercents(calories: Int, pcts: MacroPercents) -> MacroGrams {
    .init(
        proteinG: Int((Double(calories * pcts.proteinPct) / 100 / 4).rounded()),
        carbsG: Int((Double(calories * pcts.carbsPct) / 100 / 4).rounded()),
        fatG: Int((Double(calories * pcts.fatPct) / 100 / 9).rounded()))
}
```

- [ ] **Step 2: Write `SettingsView.swift`** — top of the file (goal/targets/smart-goal/units cards); `ProfileSection` (Task 7) and data-export/account-actions (Task 8) append to this same file's body and struct:

```swift
import SwiftUI

private let kgPerLb = 0.453592
private let cmPerIn = 2.54

@Observable
final class SettingsViewModel {
    var goals: Goals?
    var loadError = false
    var currentKg: Double?
    var adaptiveKcal: Int?

    func load() async {
        if let cached = MealCache.shared.cachedGoals() { goals = cached; return }
        do {
            let g: Goals = try await APIClient.shared.get("/api/goals")
            goals = g
            MealCache.shared.setGoals(g)
        } catch { loadError = true }
    }

    func loadTrendsContext() async {
        if let cached = MealCache.shared.trends {
            currentKg = cached.weights.last?.trendKg
            adaptiveKcal = cached.adaptiveGoalKcal
        }
        if let t: TrendsResponse = try? await APIClient.shared.get("/api/trends", query: ["days": "90", "tz_offset": String(tzOffsetMinutes())]) {
            MealCache.shared.setTrends(t)
            currentKg = t.weights.last?.trendKg
            adaptiveKcal = t.adaptiveGoalKcal
        }
    }

    @discardableResult
    func save(_ next: Goals) async -> Bool {
        do {
            let saved: Goals = try await APIClient.shared.post("/api/goals", body: next)
            goals = saved
            MealCache.shared.setGoals(saved)
            return true
        } catch { return false }
    }
}

struct SettingsView: View {
    @State var vm = SettingsViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text("Control room").font(Theme.Typography.kicker12).foregroundStyle(Theme.mutedForeground)
                    Text("Settings").font(Theme.Typography.headline36).foregroundStyle(Theme.foreground)
                }
                if let goals = vm.goals {
                    goalCard(goals)
                    targetsCard(goals)
                    smartGoalCard(goals)
                    unitsCard(goals)
                    profileSection(goals)
                    dataAndAccountCard(goals)
                } else if vm.loadError {
                    VStack(spacing: Theme.Spacing.cluster) {
                        Text("Couldn't load your settings").font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.destructive)
                        Button("Retry") { Task { await vm.load() } }
                    }
                } else {
                    RoundedRectangle(cornerRadius: 24).fill(Theme.muted).frame(height: 288)
                }
            }
            .padding(Theme.Spacing.l)
            .padding(.bottom, 96)
        }
        .background(Theme.background)
        .task {
            async let g: () = vm.load()
            async let t: () = vm.loadTrendsContext()
            _ = await (g, t)
        }
    }

    // MARK: - Goal card

    @State private var direction = "lose"
    @State private var rateText = "0.5"
    @State private var goalWeightText = ""

    private func goalCard(_ goals: Goals) -> some View {
        let imperial = goals.unitSystem == .imperial
        let unit = imperial ? "lb" : "kg"
        return VStack(alignment: .leading, spacing: Theme.Spacing.cluster) {
            Label("Your goal", systemImage: "target").font(.system(size: 20, weight: .black)).foregroundStyle(.black)
            Picker("Direction", selection: $direction) {
                Text("Lose").tag("lose"); Text("Maintain").tag("maintain"); Text("Gain").tag("gain")
            }.pickerStyle(.segmented)
            if direction != "maintain" {
                TextField("Rate (\(unit)/week)", text: $rateText)
                    .keyboardType(.decimalPad)
                    .padding(Theme.Spacing.s).background(Color.white.opacity(0.6)).clipShape(RoundedRectangle(cornerRadius: 16))
            }
            TextField("Goal weight (\(unit), optional)", text: $goalWeightText)
                .keyboardType(.decimalPad)
                .padding(Theme.Spacing.s).background(Color.white.opacity(0.6)).clipShape(RoundedRectangle(cornerRadius: 16))
            Button("Save goal") {
                let mag = abs(Double(rateText) ?? 0)
                let signed = direction == "maintain" ? 0 : (direction == "lose" ? -mag : mag)
                let rateKg = imperial ? signed * kgPerLb : signed
                let goalKgVal: Double? = {
                    guard let w = Double(goalWeightText), w > 0 else { return nil }
                    return imperial ? w * kgPerLb : w
                }()
                var next = goals
                next.targetRateKgPerWk = (rateKg * 100).rounded() / 100
                next.goalWeightKg = goalKgVal.map { ($0 * 100).rounded() / 100 }
                Task { await vm.save(next) }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(Theme.Spacing.m).background(Theme.blockCream).clipShape(RoundedRectangle(cornerRadius: 24))
        .onAppear {
            direction = goals.targetRateKgPerWk < 0 ? "lose" : (goals.targetRateKgPerWk > 0 ? "gain" : "maintain")
        }
    }

    // MARK: - Targets card

    @State private var caloriesText = ""

    private func targetsCard(_ goals: Goals) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.cluster) {
            Text("Daily targets").font(.system(size: 20, weight: .black)).foregroundStyle(Theme.foreground)
            TextField("Calories", text: $caloriesText)
                .keyboardType(.numberPad)
                .padding(Theme.Spacing.s).background(Theme.muted).clipShape(RoundedRectangle(cornerRadius: 16))
            Text("\(goals.dailyProteinG)g protein · \(goals.dailyCarbsG)g carbs · \(goals.dailyFatG)g fat")
                .font(Theme.Typography.caption11).foregroundStyle(Theme.mutedForeground)
            Button("Save targets") {
                guard let cal = Int(caloriesText), cal >= 500 else { return }
                var next = goals
                next.dailyCalories = cal
                Task { await vm.save(next) }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(Theme.Spacing.m).background(Theme.card).clipShape(RoundedRectangle(cornerRadius: 24))
        .onAppear { caloriesText = String(goals.dailyCalories) }
    }

    // MARK: - Smart goal + units

    private func smartGoalCard(_ goals: Goals) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack {
                Label("Smart calorie goal", systemImage: "chart.line.downtrend.xyaxis").font(.system(size: 20, weight: .black)).foregroundStyle(Theme.foreground)
                Spacer()
                Toggle("", isOn: Binding(
                    get: { goals.adaptiveGoal },
                    set: { v in var next = goals; next.adaptiveGoal = v; Task { await vm.save(next) } }))
                .labelsHidden()
            }
            Text("Recalculates your daily calories every Monday from your weight trend.")
                .font(Theme.Typography.body16).foregroundStyle(Theme.mutedForeground)
        }
        .padding(Theme.Spacing.m).background(Theme.card).clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private func unitsCard(_ goals: Goals) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.cluster) {
            Label("Units", systemImage: "slider.horizontal.3").font(.system(size: 20, weight: .black)).foregroundStyle(Theme.foreground)
            Picker("Units", selection: Binding(
                get: { goals.unitSystem },
                set: { v in var next = goals; next.unitSystem = v; Task { await vm.save(next) } })) {
                Text("Metric — kg, cm").tag(UnitSystem.metric)
                Text("Imperial — lb, ft/in").tag(UnitSystem.imperial)
            }.pickerStyle(.segmented)
        }
        .padding(Theme.Spacing.m).background(Theme.card).clipShape(RoundedRectangle(cornerRadius: 24))
    }
}
```

Note for implementer: `goalCard`/`targetsCard`'s `@State` fields are declared as `SettingsView` extension state, which is valid Swift as long as they stay inside the `SettingsView` struct body (not a separate `extension SettingsView` — struct extensions can't add stored properties). If this causes a compile error, move `direction`/`rateText`/`goalWeightText`/`caloriesText` into `SettingsViewModel` as regular (non-`@State`) properties instead and read/write them via `vm.direction` etc. — report which approach you used.

- [ ] **Step 3: Verify on simulator** — build, install, launch, screenshot (temporarily present `SettingsView()` from `RootView`, same pattern as prior tasks).

- [ ] **Step 4: Commit** — `swift: Settings — goal, targets, smart-goal, units cards`

---

### Task 7: Settings — Profile section (BMR/TDEE estimate)

**Files:**
- Modify: `apps/ios/Loggi/Settings/SettingsView.swift` (add `profileSection`)

**Interfaces:**
- Consumes: `Bmr.swift` (Task 6), `SettingsViewModel.currentKg` (Task 6).

- [ ] **Step 1: Add `profileSection` to `SettingsView`** — sex/age/height/activity-level inputs, estimated-burn readout. Insert this directly into the existing `SettingsView` struct body (same file/struct Task 6 wrote — do NOT put it in a separate `extension SettingsView { ... }`; Swift extensions cannot add stored properties, and the `@State` vars below are stored properties, same constraint noted in Task 6):

```swift
    // MARK: - Profile section

    @State private var sex: Sex?
    @State private var ageText = ""
    @State private var activity: ActivityLevel?
    @State private var heightCmText = ""

    private func profileSection(_ goals: Goals) -> some View {
        let imperial = goals.unitSystem == .imperial
        let cm = Double(heightCmText) ?? 0
        let age = Int(ageText) ?? 0
        let burn: Double? = {
            guard let sex, age > 0, cm > 0, let activity, let currentKg = vm.currentKg else { return nil }
            return estimatedTdee(bmr: bmrMifflinStJeor(sex: sex, weightKg: currentKg, heightCm: cm, age: age), activity: activity)
        }()

        return VStack(alignment: .leading, spacing: Theme.Spacing.cluster) {
            Label("Your profile", systemImage: "person").font(.system(size: 20, weight: .black)).foregroundStyle(Theme.foreground)
            Text("Used to estimate how many calories you burn.").font(Theme.Typography.body16).foregroundStyle(Theme.mutedForeground)

            Picker("Sex", selection: $sex) {
                Text("Male").tag(Sex?.some(.male))
                Text("Female").tag(Sex?.some(.female))
            }.pickerStyle(.segmented)

            HStack(spacing: Theme.Spacing.cluster) {
                TextField("Age", text: $ageText).keyboardType(.numberPad)
                    .padding(Theme.Spacing.s).background(Theme.muted).clipShape(RoundedRectangle(cornerRadius: 16))
                TextField(imperial ? "Height (in cm — converted below)" : "Height (cm)", text: $heightCmText).keyboardType(.numberPad)
                    .padding(Theme.Spacing.s).background(Theme.muted).clipShape(RoundedRectangle(cornerRadius: 16))
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                ForEach(activityLevels, id: \.value) { level in
                    Button {
                        activity = level.value
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(level.label).font(.system(size: 14, weight: .bold))
                            Text(level.description).font(Theme.Typography.caption11).opacity(0.7)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(Theme.Spacing.s)
                    }
                    .foregroundStyle(activity == level.value ? Theme.primaryText : Theme.foreground)
                    .background(activity == level.value ? Theme.primaryFill : Theme.card)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                }
            }

            if let burn {
                Text("Estimated burn: ~\(Int(burn)) cal/day at your current weight.")
                    .font(Theme.Typography.caption11).foregroundStyle(Theme.mutedForeground)
            } else {
                Text("Fill everything in\(vm.currentKg == nil ? " and log a weigh-in" : "") to see your estimated daily burn.")
                    .font(Theme.Typography.caption11).foregroundStyle(Theme.mutedForeground)
            }

            Button("Save profile") {
                var next = goals
                next.sex = sex
                next.age = age > 0 ? age : nil
                next.heightCm = cm > 0 ? cm : nil
                next.activityLevel = activity
                Task { await vm.save(next) }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(Theme.Spacing.m).background(Theme.card).clipShape(RoundedRectangle(cornerRadius: 24))
        .onAppear {
            sex = goals.sex
            ageText = goals.age.map(String.init) ?? ""
            activity = goals.activityLevel
            heightCmText = goals.heightCm.map { String(Int($0)) } ?? ""
        }
    }
```
Note for implementer: the RN app converts height to ft/in when `imperial`; this port keeps a single cm text field with a placeholder hint rather than the RN app's dual ft/in fields, since the underlying stored value (`height_cm`) is unit-agnostic and Phase 2's bar is daily-use parity, not pixel-perfect form parity — flag this simplification explicitly in the task report as a deliberate, disclosed scope reduction (not a silent gap) so the controller can decide whether it needs a follow-up polish task.

- [ ] **Step 2: Verify on simulator** — build, install, launch, screenshot; confirm the profile section renders under the other Settings cards without crashing.

- [ ] **Step 3: Commit** — `swift: Settings — profile section (BMR/TDEE estimate)`

---

### Task 8: Settings — data export/account actions; tab shell wiring all four screens

**Files:**
- Modify: `apps/ios/Loggi/Settings/SettingsView.swift` (add `dataAndAccountCard`)
- Modify: `apps/ios/Loggi/Navigation/RootView.swift` (real `TabView` hosting Today/History/Weight/Settings; remove any temporary single-screen wiring Tasks 2/4/5/6 used for standalone verification)

**Interfaces:**
- Consumes: `Clerk.shared.auth.signOut()` (verified real in Phase 1, `apps/ios/Loggi/Auth/AuthGate.swift`'s sign-out `.onChange` hook already calls this pattern — reuse it, don't reinvent), `APIClient.shared`, `ShareLink` (SwiftUI, iOS 16+).
- Produces: final `SettingsView` (this task's `dataAndAccountCard` is the last piece), `RootView` hosting a real 4-tab `TabView`.

- [ ] **Step 1: Add `dataAndAccountCard` to `SettingsView`** — export JSON/CSV via `ShareLink`, sign out, delete account:

```swift
    // MARK: - Data + account

    @State private var exportedJSONURL: URL?
    @State private var exportedCSVURL: URL?
    @State private var exporting = false
    @State private var deleteConfirmText = ""
    @State private var showDeleteConfirm = false

    private struct AccountExport: Decodable {
        let meals: [ApiMeal]
    }

    private func exportData(csv: Bool) async {
        exporting = true
        defer { exporting = false }
        do {
            let data: AccountExport = try await APIClient.shared.get("/api/account")
            let body: String
            let filename: String
            if csv {
                var rows = ["date,time,meal,item,portion,calories,protein_g,carbs_g,fat_g,planned,source"]
                for meal in data.meals.sorted(by: { $0.eatenAt < $1.eatenAt }) {
                    guard let eaten = parseAPIDate(meal.eatenAt) else { continue }
                    let date = localDateString(eaten)
                    let comps = Calendar.current.dateComponents([.hour, .minute], from: eaten)
                    let time = String(format: "%02d:%02d", comps.hour ?? 0, comps.minute ?? 0)
                    for item in meal.items {
                        rows.append([date, time, meal.name, item.name, item.portion, String(item.calories), item.proteinG, item.carbsG, item.fatG, String(meal.planned), meal.source].joined(separator: ","))
                    }
                }
                body = rows.joined(separator: "\r\n") + "\r\n"
                filename = "loggi-meals-\(localDateString()).csv"
            } else {
                let encoder = JSONEncoder()
                encoder.outputFormatting = .prettyPrinted
                body = String(data: try encoder.encode(data.meals), encoding: .utf8) ?? "[]"
                filename = "loggi-export-\(localDateString()).json"
            }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
            try body.write(to: url, atomically: true, encoding: .utf8)
            if csv { exportedCSVURL = url } else { exportedJSONURL = url }
        } catch { /* export failure: no file produced, ShareLink simply won't have one to share */ }
    }

    private func dataAndAccountCard(_ goals: Goals) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.cluster) {
            Label("Your data", systemImage: "shield").font(.system(size: 20, weight: .black)).foregroundStyle(Theme.foreground)
            Text("Signed in as \(Clerk.shared.user?.primaryEmailAddress?.emailAddress ?? "—")")
                .font(Theme.Typography.caption11).foregroundStyle(Theme.mutedForeground)

            HStack(spacing: Theme.Spacing.cluster) {
                Button {
                    Task { await exportData(csv: false) }
                } label: {
                    if exporting { ProgressView() } else { Text("Export all (JSON)") }
                }
                .buttonStyle(.bordered)
                if let url = exportedJSONURL { ShareLink(item: url) { Image(systemName: "square.and.arrow.up") } }

                Button {
                    Task { await exportData(csv: true) }
                } label: {
                    if exporting { ProgressView() } else { Text("Meals CSV") }
                }
                .buttonStyle(.bordered)
                if let url = exportedCSVURL { ShareLink(item: url) { Image(systemName: "square.and.arrow.up") } }
            }

            Divider()

            Button("Log out") {
                Task { try? await Clerk.shared.auth.signOut() }
            }
            .buttonStyle(.bordered)

            Button("Delete account", role: .destructive) {
                showDeleteConfirm = true
            }
        }
        .padding(Theme.Spacing.m).background(Theme.card).clipShape(RoundedRectangle(cornerRadius: 24))
        .alert("Delete account?", isPresented: $showDeleteConfirm) {
            TextField("Type DELETE to confirm", text: $deleteConfirmText)
            Button("Cancel", role: .cancel) { deleteConfirmText = "" }
            Button("Delete forever", role: .destructive) {
                guard deleteConfirmText.trimmingCharacters(in: .whitespaces).uppercased() == "DELETE" else { return }
                Task {
                    try? await APIClient.shared.delete("/api/account")
                    try? await Clerk.shared.auth.signOut()
                }
                deleteConfirmText = ""
            }
        } message: {
            Text("This permanently erases your meals, weights, goals, and profile. It cannot be undone.")
        }
    }
```
Note for implementer: `import ClerkKit` at the top of `SettingsView.swift` is required for `Clerk.shared`. Verify `clerk.auth.signOut()`'s exact signature against the resolved SDK source (same checkout path used throughout Phase 1: `~/Library/Developer/Xcode/DerivedData/Loggi-*/SourcePackages/checkouts/clerk-ios/Sources/ClerkKit/`) if it doesn't compile as written — Phase 1's Global Constraints confirmed `try await clerk.auth.signOut()` exists, but confirm the exact call shape (property vs. static, throwing) before assuming. **`Clerk.shared.user?.primaryEmailAddress?.emailAddress` is NOT yet verified against the SDK source** (unlike `signOut()`, this exact property chain wasn't confirmed during Phase 1) — grep the `User` type in the same checkout (`Domains/**/User.swift` or similar) for the real property names/types before trusting this path; correct it and document the correction if it differs.

- [ ] **Step 2: Wire the real tab shell in `RootView.swift`** — replace whatever single-screen verification wiring Tasks 2–6 left behind with the actual 4-tab structure:

```swift
import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            TodayView()
                .tabItem { Label("Today", systemImage: "sun.max") }
            HistoryView()
                .tabItem { Label("History", systemImage: "clock") }
            WeightView()
                .tabItem { Label("Weight", systemImage: "chart.line.uptrend.xyaxis") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .tint(Theme.foreground)
    }
}
```
Note for implementer: Phase 0's `RootView` took a `route: Binding<Route>` parameter for the deep-link placeholder; check `AuthGate.swift`'s current call site (`RootView(route: $route)`) and either keep threading the binding through (e.g. select the matching tab based on `route` — a `few`-line `TabView(selection:)` addition) or, if deep-link-to-tab routing is out of scope for this task, keep the parameter accepted but unused with a comment noting Phase 5's "screenshot parity sweep" is where deep-link-to-specific-tab routing should be verified end-to-end. Do not silently drop the `route` parameter without checking what calls `RootView(route:)` first — a compile error there is expected and must be resolved, not routed around by deleting the binding from the call site.

- [ ] **Step 3: Verify on simulator** — full run: build, install, launch, screenshot each of the 4 tabs via `dev-loop.sh` (tap through tabs manually if the script doesn't support tab-switching automation — note in the report if manual simulator interaction was needed beyond the script). Confirm all four tabs render without crashing, both signed-out (shows sign-in screen, unaffected) and, if a real session is available via the credential-minting recipe, signed-in.

- [ ] **Step 4: Commit** — `swift: Settings data export/account actions; wire 4-tab shell (Today/History/Weight/Settings)`

---

## Self-review notes

- **Spec coverage:** all four Phase 2 spec bullets are covered — Today (Task 2: hero/macros/day-paging/streaks; Task 3: Monday note + smart goal), History (Task 4), Weight (Task 5), Settings (Task 6: goal/targets/smart-goal/units; Task 7: profile; Task 8: data export/account actions). Exit criterion ("daily-use parity for a signed-in user who logs nothing") is exercised by every task's Step 4/verify since the only real test account available has no logged data — this is the actual, representative "logs nothing" user the criterion describes, not a hypothetical.
- **Placeholder scan:** none of the 8 tasks contain "add appropriate handling"-style placeholders; every step has complete code. Two explicitly-disclosed, deliberate scope reductions exist (not placeholders): Task 3's `MilestoneCard` is written but not wired into `TodayView`'s body (full milestone-detection logic needs Phase 3's logging to be reachable), and Task 7's profile height field is a single cm input rather than the RN app's ft/in dual-field UI. Both are called out explicitly in their tasks' implementer notes so they surface in task reports rather than being silently absorbed.
- **Type consistency:** `TrendsResponse`/`WeightPoint`/`TrendPoint`/`Verdict`/`EnergyBalance` (Task 1) are referenced identically by field name across Tasks 2/3/4/5/6/7 (`.weights`, `.adaptiveGoalKcal`, `.verdict.status`, `.balance.tdeeKcal`, etc.) — cross-checked against Task 1's own definitions while writing each later task. `MealCache`'s new members (`historyRange`, `reconcileRange`, `rangeIsFresh`, `trends`, `setTrends`, `goalForDate`, `recordDailyGoal`) are consumed with matching signatures in Tasks 2–6. `TodayViewModel.addDays` (Task 2, `static`) is reused by `HistoryView`/`WeightView` (Tasks 4/5) rather than being duplicated — flagged here so an implementer doesn't accidentally write a second date-arithmetic helper.
- **Known deferred scope** (explicit in Global Constraints, not oversight): Monday-note/evening-reminder notification toggles, Apple Health card, Milestone share-card ImageRenderer action, "usual meal" one-tap-log suggestion, Ask Bevi entry point, Dinner-out Live Activity — all explicitly Phase 4 ("Growth surfaces") or Phase 3 ("Logging") per the approved rewrite spec's phase breakdown, not missed requirements.
- **Verification-discipline carryover from Phase 1:** every task that introduces a new Codable model or a new Clerk/SDK call is instructed to verify against a real API response or the real resolved SDK source, not trust this plan's transcription blind — Phase 1 found real drift in both categories (Clerk symbol guesses, and API/client field-shape drift) and there is no reason to assume Phase 2's transcription is any more reliable a priori.
- **Theme/spacing scope note for the controller:** Task 1 completes two DESIGN.md-documented tokens Phase 0 didn't finish (`bigMetric60`, `Spacing.cluster`) rather than inventing new ones — per AGENTS.md's carve-out for changes that fit existing, already-approved conventions. If the controller reads AGENTS.md's convention-first gate more strictly than that carve-out allows, pause Task 1's Step 2 for an explicit go-ahead before executing — it's a two-line addition, cheap to gate if desired.
