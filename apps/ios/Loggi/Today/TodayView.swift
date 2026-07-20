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
                    if vm.isToday, let recap = vm.trends?.recap {
                        MondayNoteCard(recap: recap, verdictStatus: vm.trends?.verdict.status ?? .collecting)
                    }
                    // MilestoneCard slot: deliberately left as EmptyView() —
                    // see MilestoneCard.swift's doc comment. Not a silent
                    // omission, a documented deferral to Phase 3+.
                    EmptyView()
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
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text(vm.isToday ? "Today" : vm.date)
                    .font(Theme.Typography.kicker12).foregroundStyle(Theme.mutedForeground)
                Text(vm.isToday ? greeting() : vm.date)
                    .font(Theme.Typography.headline36).foregroundStyle(Theme.foreground)
            }
            Spacer()
            if vm.isToday, let streak = vm.streak, streak > 0 {
                VStack(alignment: .trailing, spacing: Theme.Spacing.xs) {
                    // Labels ported from index.tsx's badges: "4/7" reads as
                    // "four slash seven" to VoiceOver otherwise.
                    Label("\(streak)/7", systemImage: "bolt.fill")
                        .font(.system(size: 12, weight: .bold))
                        .padding(.horizontal, Theme.Spacing.s).padding(.vertical, 4)
                        .background(Theme.accentLog).clipShape(Capsule())
                        .foregroundStyle(.black)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(streak) of 7 days logged this week")
                    if onTarget > 0 {
                        Label("\(onTarget) on target", systemImage: "checkmark")
                            .font(.system(size: 12, weight: .bold))
                            .padding(.horizontal, Theme.Spacing.s).padding(.vertical, 4)
                            .background(Theme.blockMint).clipShape(Capsule())
                            .foregroundStyle(.black)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(onTarget) days on target this week")
                    }
                }
            }
        }
    }

    private var dayNav: some View {
        HStack {
            // Icon-only buttons announce nothing without these — index.tsx
            // carries the same two labels on its prev/next controls.
            Button(action: vm.goPrev) { Image(systemName: "chevron.left") }
                .frame(width: 44, height: 44)
                .accessibilityLabel("Previous day")
            Spacer()
            Text(vm.isToday ? "TODAY" : vm.date.uppercased())
                .font(.system(size: 11, weight: .heavy)).foregroundStyle(Theme.mutedForeground)
            Spacer()
            Button(action: vm.goNext) { Image(systemName: "chevron.right") }
                .frame(width: 44, height: 44)
                .disabled(vm.isToday)
                .accessibilityLabel("Next day")
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
