import SwiftUI

// MealCache.shared/SaveQueue.shared are @MainActor-isolated (see State/MealCache.swift,
// State/SaveQueue.swift) — this view model calls them directly from load()/loadGoals()/
// loadStreak() without `await`, so it must share that isolation. Swift 6 strict
// concurrency also requires it for the `async let`s in TodayView's .task to capture
// `vm` across the (trivial, same-actor) boundary: a plain non-Sendable class can't
// cross an actor boundary even when the destination is the same actor it's already on.
@MainActor
@Observable
final class TodayViewModel {
    var meals: [ApiMeal]?
    var goals: Goals?
    var date: String
    let today: String
    var streak: Int?
    var daySums: [String: Double] = [:]
    var dayPickerOpen = false
    var trends: TrendsResponse?

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

    /// Smart-goal + Monday-note source. Non-critical — Today degrades
    /// gracefully without it (no adaptive goal, no recap card), matching RN's
    /// `trends` query having no error UI of its own.
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

/// Today — hero card, macros, day paging, streak badges, Monday-note recap.
/// Ports apps/mobile/app/(tabs)/index.tsx. Phase 2 Task 3 added the
/// trends fetch, the smart-goal read, and `MondayNoteCard` (shown on Today
/// only, when `trends.recap` exists). `MilestoneCard` exists
/// (Today/MilestoneCard.swift) but is deliberately NOT wired into the body
/// yet — its RN counterpart's milestone-detection engine depends on
/// locally-persisted "seen" state that only matters once Phase 3's real
/// logging makes milestones reachable; see MilestoneCard.swift's doc comment.
/// The "usual meal" suggestion is Phase 3, Ask Bevi/Apple Health are Phase 4.
/// The meal journal row here is read-only — MealListItem's photo thumbnail
/// and tap-to-open edit/delete drawer are Phase 3 (drawer edit/delete is a
/// logging mutation, out of scope for a read-surfaces task).
struct TodayView: View {
    @State private var vm = TodayViewModel()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var totals: (calories: Double, protein: Double, carbs: Double, fat: Double) {
        (vm.meals ?? []).filter { !$0.planned }.reduce((0.0, 0.0, 0.0, 0.0)) { acc, meal in
            let t = mealTotals(meal)
            return (acc.0 + t.calories, acc.1 + t.protein, acc.2 + t.carbs, acc.3 + t.fat)
        }
    }
    private var reserved: Double {
        (vm.meals ?? []).filter(\.planned).reduce(0) { $0 + mealTotals($1).calories }
    }
    /// Prefers the trend-derived adaptive goal when the user has smart goals
    /// on, matching RN's `trendGoal ?? goals.daily_calories` exactly.
    private var dailyGoal: Double {
        if vm.goals?.adaptiveGoal == true, let adaptive = vm.trends?.adaptiveGoalKcal {
            return Double(adaptive)
        }
        return Double(vm.goals?.dailyCalories ?? 0)
    }
    private var remaining: Double { (vm.goals == nil) ? 0 : dailyGoal - totals.calories - reserved }
    private var isOver: Bool { remaining < 0 }
    private var onTarget: Int {
        guard let goals = vm.goals else { return 0 }
        return vm.daySums.filter { date, calories in
            date != vm.today && calories > 0 && calories <= Double(MealCache.shared.goalForDate(date, fallback: goals.dailyCalories))
        }.count
    }

    private static let figure: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        return f
    }()
    /// Thousands separators on every figure — "1,950" not "1950". Tracked as a
    /// systemic gap since Phase 2 Task 4; the rebuild is the place to fix it.
    private func fmt(_ value: Double) -> String {
        Self.figure.string(from: NSNumber(value: Int(value.rounded()))) ?? "\(Int(value))"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme2.Space.l) {
                header
                dayNav
                if vm.meals == nil || vm.goals == nil {
                    skeleton
                } else {
                    if vm.isToday, let recap = vm.trends?.recap {
                        MondayNoteCard(recap: recap, verdictStatus: vm.trends?.verdict.status ?? .collecting)
                    }
                    // MilestoneCard slot: deliberately left empty — see
                    // MilestoneCard.swift. A documented deferral, not an omission.
                    heroCard
                    macroCard
                    if vm.meals!.isEmpty {
                        emptyState
                    } else {
                        mealJournal
                    }
                }
            }
            .padding(Theme2.Space.l)
            .padding(.bottom, 96)
        }
        .background(Theme2.canvas)
        .refreshable {
            // DESIGN.md mandates pull-to-refresh here; the Phase 2 port never
            // had it. Native .refreshable is the whole implementation.
            async let m: () = vm.load()
            async let g: () = vm.loadGoals()
            async let s: () = vm.loadStreak()
            async let t: () = vm.loadTrends()
            _ = await (m, g, s, t)
        }
        .task {
            MealCache.shared.hydrate()
            SaveQueue.shared.hydrate()
            async let m: () = vm.load()
            async let g: () = vm.loadGoals()
            async let s: () = vm.loadStreak()
            async let t: () = vm.loadTrends()
            _ = await (m, g, s, t)
        }
        .onChange(of: vm.date) { _, _ in Task { await vm.load() } }
        .onChange(of: dailyGoal) { _, newValue in
            if newValue > 0 { MealCache.shared.recordDailyGoal(vm.today, kcal: Int(newValue)) }
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                Text(vm.isToday ? "TODAY" : vm.date.uppercased())
                    .font(Theme2.Text.kicker).foregroundStyle(Theme2.inkSecondary)
                Text(vm.isToday ? greeting() : vm.date)
                    .font(Theme2.Text.headline36).foregroundStyle(Theme2.ink)
            }
            Spacer(minLength: Theme2.Space.m)
            if vm.isToday, let streak = vm.streak, streak > 0 {
                VStack(alignment: .trailing, spacing: Theme2.Space.xs) {
                    // Streak keeps vermilion: logging IS its meaning, so this
                    // is the accent's rule being honoured, not decoration.
                    Label("\(streak)/7", systemImage: "bolt.fill")
                        .font(Theme2.Text.caption)
                        .padding(.horizontal, Theme2.Space.m).padding(.vertical, Theme2.Space.xs)
                        .background(Theme2.accentLog, in: Capsule())
                        .foregroundStyle(Theme2.blockInk)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(streak) of 7 days logged this week")
                    if onTarget > 0 {
                        StatusBadge(status: .onTarget, text: "\(onTarget) on target")
                    }
                }
            }
        }
    }

    private var dayNav: some View {
        HStack {
            Button(action: vm.goPrev) { Image(systemName: "chevron.left") }
                .frame(width: 44, height: 44)
                .accessibilityLabel("Previous day")
            Spacer()
            Text(vm.isToday ? "TODAY" : vm.date.uppercased())
                .font(Theme2.Text.kicker).foregroundStyle(Theme2.inkSecondary)
            Spacer()
            Button(action: vm.goNext) { Image(systemName: "chevron.right") }
                .frame(width: 44, height: 44)
                .disabled(vm.isToday)
                .accessibilityLabel("Next day")
        }
        .tint(Theme2.ink)
        .overlay(Rectangle().fill(Theme2.hairline).frame(height: 1), alignment: .top)
        .padding(.top, Theme2.Space.s)
    }

    private var skeleton: some View {
        VStack(spacing: Theme2.Space.m) {
            RoundedRectangle(cornerRadius: Theme2.Radius.card, style: .continuous)
                .fill(Theme2.hairline).frame(height: 180)
            RoundedRectangle(cornerRadius: Theme2.Radius.card, style: .continuous)
                .fill(Theme2.hairline).frame(height: 140)
        }
        .accessibilityLabel("Loading today")
    }

    /// Lime when on target, coral when over — both are pastel SURFACES, so the
    /// swap is expressive rather than data-carrying, and the over/under meaning
    /// is still carried by the "cal over" wording and the status badge.
    private var heroCard: some View {
        PastelCard(tone: isOver ? .coral : .lime) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(isOver ? "OVER TARGET" : "STILL AVAILABLE")
                        .font(Theme2.Text.kicker)
                        .foregroundStyle(Theme2.blockInkSecondary)
                    Text(fmt(abs(remaining)))
                        .font(Theme2.Text.display60)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    Text(isOver ? "cal over" : "cal left")
                        .font(Theme2.Text.label)
                        .foregroundStyle(Theme2.blockInkSecondary)
                    VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                        Text("\(fmt(totals.calories)) of \(fmt(dailyGoal)) eaten")
                        if reserved > 0 {
                            Text("\(fmt(reserved)) reserved for later")
                        }
                    }
                    .font(Theme2.Text.caption)
                    .foregroundStyle(Theme2.blockInkSecondary)
                    .padding(.top, Theme2.Space.s)
                }
                Spacer(minLength: Theme2.Space.s)
            }
        }
        .animation(reduceMotion ? nil : Theme2.Motion.standard, value: isOver)
    }

    /// Macros sit on the neutral surface, never on the pastel hero: fat is
    /// 2.3-2.9:1 on lime/coral. PastelCard documents the rule.
    private var macroCard: some View {
        SurfaceCard {
            VStack(spacing: Theme2.Space.m) {
                MacroBar(macro: .protein, grams: totals.protein, goal: Double(vm.goals?.dailyProteinG ?? 0))
                MacroBar(macro: .carbs, grams: totals.carbs, goal: Double(vm.goals?.dailyCarbsG ?? 0))
                MacroBar(macro: .fat, grams: totals.fat, goal: Double(vm.goals?.dailyFatG ?? 0))
            }
        }
    }

    private var emptyState: some View {
        SurfaceCard {
            EmptyStateView(
                title: vm.isToday ? "Nothing logged yet" : "No meals this day",
                message: vm.isToday
                    ? "Snap a photo of your next meal and it'll show up here."
                    : "Add a meal to log it for this day.",
                bevi: vm.isToday ? "bevi-camera" : nil,
                systemImage: "calendar")
        }
    }

    private var mealJournal: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.m) {
            Text("MEAL JOURNAL")
                .font(Theme2.Text.kicker).foregroundStyle(Theme2.inkSecondary)
            ForEach(vm.meals ?? []) { meal in
                SurfaceCard {
                    HStack {
                        VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                            Text(meal.name)
                                .font(Theme2.Text.label).foregroundStyle(Theme2.ink)
                            if meal.planned {
                                Text("Planned")
                                    .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                            }
                        }
                        Spacer(minLength: Theme2.Space.s)
                        Text("\(fmt(mealTotals(meal).calories)) cal")
                            .font(Theme2.Text.figure).foregroundStyle(Theme2.ink)
                    }
                    .accessibilityElement(children: .combine)
                }
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
