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
    // Re-derived on every successful load (mirrors history.tsx's
    // `setToday(localDateString(now))` in its load() success path), not
    // cached once at init — a view model that stays alive across a local
    // midnight boundary must not keep grading "today" against yesterday.
    var today = localDateString()

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
            today = localDateString(now)
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

    /// One entry per day in the range, zero-filled for unlogged days.
    /// `label` ("7/20") is BOTH the axis tick and CalorieChart's categorical
    /// key — unique per day here, which is what keeps bars from merging.
    private var chartDays: [CalorieChart.Day] {
        let byDate = Dictionary(uniqueKeysWithValues: vm.days.map { ($0.date, $0.calories) })
        var points: [CalorieChart.Day] = []
        for i in stride(from: vm.range - 1, through: 0, by: -1) {
            let d = TodayViewModel.addDays(vm.today, -i)
            points.append(.init(date: Self.dayLabel(d), label: Self.chartLabel(d), calories: byDate[d] ?? 0))
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
            VStack(alignment: .leading, spacing: Theme2.Space.l) {
                VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                    Text("ARCHIVE").font(Theme2.Text.kicker).foregroundStyle(Theme2.inkSecondary)
                    Text("History").font(Theme2.Text.headline36).foregroundStyle(Theme2.ink)
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
            .padding(Theme2.Space.l)
            .padding(.bottom, 96)
        }
        .background(Theme2.canvas)
        .refreshable { await vm.load(force: true) }
        .task {
            async let m: () = vm.load()
            async let g: () = vm.loadGoals()
            _ = await (m, g)
        }
    }

    private static let figure: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        return f
    }()
    private func fmt(_ value: Double) -> String {
        Self.figure.string(from: NSNumber(value: Int(value.rounded()))) ?? "\(Int(value))"
    }

    private var skeleton: some View {
        VStack(spacing: Theme2.Space.m) {
            RoundedRectangle(cornerRadius: Theme2.Radius.card, style: .continuous)
                .fill(Theme2.hairline).frame(height: 220)
            RoundedRectangle(cornerRadius: Theme2.Radius.card, style: .continuous)
                .fill(Theme2.hairline).frame(height: 64)
        }
        .accessibilityLabel("Loading history")
    }

    private var retryState: some View {
        SurfaceCard {
            VStack(spacing: Theme2.Space.m) {
                EmptyStateView(
                    title: "Couldn't load",
                    message: "Check your connection and try again.",
                    systemImage: "wifi.exclamationmark")
                Button {
                    Task { await vm.load(force: true) }
                } label: {
                    Text("Retry")
                        .font(Theme2.Text.label)
                        .foregroundStyle(Theme2.canvas)
                        .padding(.horizontal, Theme2.Space.xl)
                        .frame(minHeight: 44)
                        .background(Theme2.ink, in: Capsule())
                }
            }
        }
    }

    private var emptyState: some View {
        SurfaceCard {
            EmptyStateView(
                title: "No meals yet",
                message: "Your logged days — and a calorie chart — show up here once you log a meal.",
                bevi: "bevi-clipboard")
        }
    }

    /// Chart lives on the NEUTRAL surface, not a pastel: chart marks use the
    /// status colours, and those aren't validated against pastel grounds
    /// (PastelCard documents the rule). The lilac card the RN app used carried
    /// no marks — only the heading and insight text.
    private var chartCard: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.m) {
            PastelCard(tone: .lilac) {
                // One VStack, not two siblings: PastelCard takes a
                // @ViewBuilder, so sibling views render as SEPARATE cards.
                // That split the insight line into its own floating card.
                VStack(alignment: .leading, spacing: Theme2.Space.s) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                        Text("PLATE INDEX")
                            .font(Theme2.Text.kicker).foregroundStyle(Theme2.blockInkSecondary)
                        Text("Calories").font(Theme2.Text.title)
                    }
                    Spacer(minLength: Theme2.Space.m)
                    SegmentedToggle(options: [("7d", 7), ("30d", 30)], selection: $vm.range)
                        .frame(width: 130)
                }
                if let insight {
                    Text(insightText(insight))
                        .font(Theme2.Text.caption)
                        .foregroundStyle(Theme2.blockInkSecondary)
                }
                }
            }
            SurfaceCard {
                CalorieChart(days: chartDays, goal: Double(vm.goals?.dailyCalories ?? 0))
            }
        }
    }

    private func insightText(_ insight: (avg: Int, logged: Int, onTarget: Int)) -> String {
        var text = "Avg \(fmt(Double(insight.avg))) cal across \(insight.logged) logged \(insight.logged == 1 ? "day" : "days")"
        if insight.onTarget > 0 { text += " · \(insight.onTarget) on target" }
        return text
    }

    private func dayCard(_ day: HistoryViewModel.DayGroup) -> some View {
        let isOpen = vm.expandedDate == day.date
        let overGoal: Bool = {
            guard let goals = vm.goals else { return false }
            return day.calories > Double(MealCache.shared.goalForDate(day.date, fallback: goals.dailyCalories))
        }()
        return SurfaceCard {
            VStack(alignment: .leading, spacing: Theme2.Space.s) {
                Button {
                    vm.expandedDate = isOpen ? nil : day.date
                } label: {
                    HStack {
                        Text(Self.dayLabel(day.date))
                            .font(Theme2.Text.label).foregroundStyle(Theme2.ink)
                        Spacer(minLength: Theme2.Space.s)
                        // Over-goal carries an ICON as well as colour — the
                        // status pair is indistinguishable by hue under CVD.
                        if overGoal {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(Theme2.Text.caption)
                                .foregroundStyle(Theme2.statusOver)
                        }
                        Text("\(fmt(day.calories)) cal")
                            .font(Theme2.Text.figure)
                            .foregroundStyle(overGoal ? Theme2.statusOver : Theme2.ink)
                        Image(systemName: isOpen ? "chevron.up" : "chevron.down")
                            .font(Theme2.Text.caption)
                            .foregroundStyle(Theme2.inkSecondary)
                    }
                    .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Self.dayLabel(day.date))
                .accessibilityValue("\(fmt(day.calories)) calories\(overGoal ? ", over target" : "")")
                .accessibilityHint(isOpen ? "Collapse" : "Expand")

                if isOpen {
                    Divider().overlay(Theme2.hairline)
                    ForEach(day.meals) { meal in
                        HStack {
                            Text(meal.name)
                                .font(Theme2.Text.body).foregroundStyle(Theme2.ink)
                            Spacer(minLength: Theme2.Space.s)
                            Text("\(fmt(mealTotals(meal).calories)) cal")
                                .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                                .monospacedDigit()
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
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
