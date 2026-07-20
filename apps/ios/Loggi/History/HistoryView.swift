import SwiftUI

/// Ports apps/mobile/app/(tabs)/history.tsx. MealListItem's photo thumbnail
/// and tap-to-open edit/delete drawer are Phase 3 (same documented deferral
/// as TodayView's meal journal — see TodayView.swift), so expanded day rows
/// here are read-only name+calories, matching Today's current scope.
@MainActor
@Observable
final class HistoryViewModel {
    var meals: [ApiMeal]?
    var goals: Goals?
    var range: Int = 7
    var expandedDate: String?
    var failed = false
    let today = localDateString()

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
        do {
            let g: Goals = try await APIClient.shared.get("/api/goals")
            goals = g
            MealCache.shared.setGoals(g)
        } catch { /* History degrades gracefully without goals — no goal line/on-target */ }
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
            // Planned (reserved, unconfirmed) meals don't count as eaten calories.
            DayGroup(date: date, meals: dayMeals,
                      calories: dayMeals.filter { !$0.planned }.reduce(0) { $0 + mealTotals($1).calories })
        }.sorted { $0.date > $1.date }
    }
}

/// History — "Plate index" bar chart card (7d/30d toggle, dashed goal line,
/// one-line range insight) + expandable day-group cards. Ports
/// apps/mobile/app/(tabs)/history.tsx per DESIGN.md §4.3 "History".
struct HistoryView: View {
    @State private var vm = HistoryViewModel()

    private var chartData: [CalorieBarChart.Point] {
        let byDate = Dictionary(uniqueKeysWithValues: vm.days.map { ($0.date, $0.calories) })
        var points: [CalorieBarChart.Point] = []
        for i in stride(from: vm.range - 1, through: 0, by: -1) {
            let d = TodayViewModel.addDays(vm.today, -i)
            points.append(.init(label: Self.chartLabel(d), calories: byDate[d] ?? 0))
        }
        return points
    }

    /// Trailing-N-day read: average across logged days, plus how many
    /// finished days came in at or under target (today excluded — a
    /// half-logged day isn't a win, same rule as Today's counter). Mirrors
    /// history.tsx's `insight` memo.
    private var insight: (avg: Int, logged: Int, onTarget: Int)? {
        let cutoff = TodayViewModel.addDays(vm.today, -(vm.range - 1))
        let inRange = vm.days.filter { $0.date >= cutoff }
        guard !inRange.isEmpty else { return nil }
        let avg = Int((inRange.reduce(0.0) { $0 + $1.calories } / Double(inRange.count)).rounded())
        let goal = vm.goals?.dailyCalories ?? 0
        let onTarget = goal > 0
            ? inRange.filter { $0.date != vm.today && $0.calories <= Double(MealCache.shared.goalForDate($0.date, fallback: goal)) }.count
            : 0
        return (avg, inRange.count, onTarget)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text("Archive").font(Theme.Typography.kicker12).foregroundStyle(Theme.mutedForeground)
                    Text("History").font(Theme.Typography.headline36).foregroundStyle(Theme.foreground)
                }

                if vm.meals == nil && vm.failed {
                    retryState
                } else if vm.meals == nil {
                    skeleton
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
        .refreshable { await vm.load(force: true) }
        .task {
            async let m: () = vm.load()
            async let g: () = vm.loadGoals()
            _ = await (m, g)
        }
    }

    private var skeleton: some View {
        VStack(spacing: Theme.Spacing.m) {
            RoundedRectangle(cornerRadius: 24).fill(Theme.muted).frame(height: 192)
            RoundedRectangle(cornerRadius: 16).fill(Theme.muted).frame(height: 64)
        }
    }

    private var retryState: some View {
        VStack(spacing: Theme.Spacing.cluster) {
            Text("Couldn't load").font(.system(size: 18, weight: .black)).foregroundStyle(Theme.foreground)
            Text("Check your connection and try again.")
                .font(Theme.Typography.body16).foregroundStyle(Theme.mutedForeground).multilineTextAlignment(.center)
            Button {
                Task { await vm.load(force: true) }
            } label: {
                Text("Retry").font(.system(size: 15, weight: .black)).foregroundStyle(Theme.primaryText)
                    .padding(.horizontal, Theme.Spacing.l)
                    .frame(minHeight: 44)
                    .background(Theme.primaryFill)
                    .clipShape(Capsule())
            }
        }
        .frame(maxWidth: .infinity).padding(32).background(Theme.card).clipShape(RoundedRectangle(cornerRadius: 24))
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
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                CalorieBarChart(data: chartData, goal: vm.goals.map { Double($0.dailyCalories) })
                if let goal = vm.goals?.dailyCalories {
                    Text("Goal \(goal) cal").font(Theme.Typography.caption11).foregroundStyle(.black.opacity(0.6))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
            if let insight {
                Text(insightText(insight))
                    .font(.system(size: 12, weight: .bold)).foregroundStyle(.black.opacity(0.6))
                    .padding(.top, Theme.Spacing.s)
                    .overlay(Rectangle().fill(Color.black.opacity(0.15)).frame(height: 1), alignment: .top)
            }
        }
        .padding(Theme.Spacing.m).background(Theme.blockLilac).clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private func insightText(_ insight: (avg: Int, logged: Int, onTarget: Int)) -> String {
        var text = "Avg \(insight.avg) cal across \(insight.logged) logged \(insight.logged == 1 ? "day" : "days")"
        if insight.onTarget > 0 { text += " · \(insight.onTarget) on target" }
        return text
    }

    private func dayCard(_ day: HistoryViewModel.DayGroup) -> some View {
        let isOpen = vm.expandedDate == day.date
        let overGoal: Bool = {
            guard let goals = vm.goals else { return false }
            return day.calories > Double(MealCache.shared.goalForDate(day.date, fallback: goals.dailyCalories))
        }()
        return VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Button {
                vm.expandedDate = isOpen ? nil : day.date
            } label: {
                HStack {
                    Text(Self.dayLabel(day.date)).font(.system(size: 17, weight: .black)).foregroundStyle(Theme.foreground)
                    Spacer()
                    HStack(spacing: 4) {
                        if overGoal {
                            Image(systemName: "arrow.up.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.destructive)
                        }
                        Text("\(Int(day.calories)) cal")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(overGoal ? Theme.destructive : Theme.foreground)
                    }
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

    /// "yyyy-MM-dd" -> "Sun, Jul 20", matching RN's
    /// `toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })`.
    private static func dayLabel(_ date: String) -> String {
        guard let d = parseCalendarDate(date) else { return date }
        let out = DateFormatter()
        out.dateFormat = "EEE, MMM d"
        out.locale = Locale(identifier: "en_US_POSIX")
        out.timeZone = .current
        return out.string(from: d)
    }

    /// "yyyy-MM-dd" -> "7/20", matching RN's
    /// `toLocaleDateString([], { month: "numeric", day: "numeric" })`.
    private static func chartLabel(_ date: String) -> String {
        guard let d = parseCalendarDate(date) else { return date }
        let out = DateFormatter()
        out.dateFormat = "M/d"
        out.locale = Locale(identifier: "en_US_POSIX")
        out.timeZone = .current
        return out.string(from: d)
    }

    private static func parseCalendarDate(_ date: String) -> Date? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = .current
        return f.date(from: date)
    }
}
