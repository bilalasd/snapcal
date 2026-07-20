import SwiftUI

private let kgPerLb = 0.453592

// MealCache.shared is @MainActor-isolated (see State/MealCache.swift) —
// this view model calls it directly from load() without `await`, same
// reasoning TodayViewModel/HistoryViewModel already document: it must share
// that isolation to compile under this project's Swift 6 strict
// concurrency checking.
@MainActor
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

/// Weight — "Trend desk." Ports apps/mobile/app/(tabs)/weight.tsx per
/// DESIGN.md §4.3's Weight bullet: "+ Log" button, weigh-in nudge card when
/// stale, "LATEST WEIGH-IN" metric card with 30d/90d chart, stat cards
/// (To go / Current rate / Maintenance), verdict/advisory card, weekly
/// recap. Pull-to-refresh refetches trends.
///
/// "Ask Bevi" button and Apple Health sync are Phase 4, matching the
/// existing documented deferral pattern (TodayView/HistoryView's own Phase-4
/// items). The RN screen's "This week's smart calorie goal" card and its
/// "Based on N logged days / M weigh-ins..." balance detail line exist in
/// weight.tsx but aren't named in DESIGN.md §4.3's Weight bullet — left out
/// of this task's scope on that basis (DESIGN.md is the binding spec here
/// per AGENTS.md, not 1:1 RN parity for every line).
///
/// `data.balance` (`EnergyBalance`) is load-bearing on the "Maintenance"
/// stat card below. Per Task 1's report, `EnergyBalance`/`AuditStats`'
/// inner field names are only SOURCE-verified (read directly from
/// packages/shared/src/trend.ts + apps/api/src/app/api/trends/route.ts),
/// not live-verified against a populated non-null `/api/trends` response —
/// the test account can't clear the 14-day/10-logged-day/4-weigh-in
/// thresholds without a large amount of backfilled mutating test data. This
/// task's report explains why that wasn't attempted live even though a
/// mutating POST was in-scope for this task: `/api/weights` has no DELETE
/// route (confirmed by reading apps/api/src/app/api/weights/*), so a real
/// POST couldn't be cleaned up afterward the way meals (which do have
/// DELETE) could.
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
    /// Days since the latest weigh-in, matching weight.tsx's `daysSince`.
    /// RN parses at noon (`T12:00:00`) as a DST-safety nicety; this follows
    /// the codebase's existing established precedent instead
    /// (HistoryView.parseCalendarDate / TodayViewModel.addDays both parse
    /// plain "yyyy-MM-dd" at local midnight with no ill effect for a value
    /// only ever compared against a >=4-day threshold).
    private var daysSinceLatest: Int? {
        guard let latest, let d = Self.parseCalendarDate(latest.date) else { return nil }
        return Int(Date().timeIntervalSince(d) / 86_400)
    }
    /// Distance from the smoothed trend weight to the goal, in the user's
    /// units. Mirrors weight.tsx's `toGo` memo.
    private var toGo: Double? {
        guard let latest, let goalKg = vm.data?.goalWeightKg else { return nil }
        let diff = toUnit(latest.trendKg) - toUnit(goalKg)
        return abs((diff * 10).rounded() / 10)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                header
                if let days = daysSinceLatest, days >= 4 {
                    alertCard(icon: "exclamationmark.triangle", title: "Time for a weigh-in",
                              body: "Your last weigh-in was \(days) days ago. Log one to keep your trend current.")
                }
                if let err = vm.errorMessage {
                    alertCard(icon: "exclamationmark.triangle", title: "Couldn't load trends", body: err, destructive: true)
                }
                if vm.data == nil {
                    skeleton
                } else if let data = vm.data {
                    if data.weights.isEmpty {
                        emptyState
                    } else {
                        chartCard(data)
                    }
                    statsRow(data)
                    verdictCard(data.verdict)
                    if let recap = data.recap {
                        recapCard(recap)
                    }
                }
            }
            .padding(Theme.Spacing.l)
            .padding(.bottom, 96)
        }
        .background(Theme.background)
        // DESIGN.md §4.3 Weight: "Pull-to-refresh refetches trends."
        .refreshable { await vm.load() }
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
            Button {
                vm.logSheetOpen = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "plus")
                    Text("Log")
                }
                .font(.system(size: 14, weight: .bold))
                .padding(.horizontal, Theme.Spacing.m)
                .frame(minHeight: 44)
                .background(Theme.primaryFill).foregroundStyle(Theme.primaryText).clipShape(Capsule())
            }
        }
    }

    private var skeleton: some View {
        VStack(spacing: Theme.Spacing.m) {
            RoundedRectangle(cornerRadius: 24).fill(Theme.muted).frame(height: 288)
            HStack(spacing: Theme.Spacing.cluster) {
                RoundedRectangle(cornerRadius: 24).fill(Theme.muted).frame(height: 80)
                RoundedRectangle(cornerRadius: 24).fill(Theme.muted).frame(height: 80)
            }
            RoundedRectangle(cornerRadius: 16).fill(Theme.muted).frame(height: 64)
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
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text("Latest weigh-in").font(Theme.Typography.kicker12).foregroundStyle(.black.opacity(0.6))
                    if let latest {
                        Text("\(String(format: "%.1f", toUnit(latest.weightKg))) \(unit)")
                            .font(.system(size: 40, weight: .black)).foregroundStyle(.black)
                        Text("Trend \(String(format: "%.1f", toUnit(latest.trendKg))) \(unit)")
                            .font(Theme.Typography.caption11).foregroundStyle(.black.opacity(0.6))
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
                points: chartWeights.map { .init(label: Self.chartLabel($0.date), measured: toUnit($0.weightKg), trend: toUnit($0.trendKg)) },
                goal: data.goalWeightKg.map(toUnit))
        }
        .padding(Theme.Spacing.m).background(Theme.blockCream).clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private func statsRow(_ data: TrendsResponse) -> some View {
        VStack(spacing: Theme.Spacing.cluster) {
            HStack(spacing: Theme.Spacing.cluster) {
                statCard("Current rate", data.rateKgPerWeek.map { "\($0 > 0 ? "+" : "")\(String(format: "%.2f", toUnit($0))) \(unit)/wk" } ?? "—")
                statCard("Maintenance", data.balance.map { "\($0.tdeeKcal) cal" } ?? "—")
            }
            if let toGo {
                statCard("To go", toGo == 0 ? "Reached" : "\(String(format: "%.1f", toGo)) \(unit)")
            }
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
                return ("clock", "Collecting data",
                        "The deficit verdict needs consistent logging first. Still needed: \(verdict.missing.joined(separator: ", ")).")
            case .onTrack:
                return ("checkmark.circle", "On track",
                         "You're averaging a \(abs(verdict.actualDeficitKcal)) cal/day \(verdict.actualDeficitKcal >= 0 ? "deficit" : "surplus"), right around the \(verdict.neededDeficitKcal) cal/day needed for your target rate.")
            case .adjust:
                return ("exclamationmark.triangle", "Adjust intake",
                         "Your average \(verdict.actualDeficitKcal >= 0 ? "deficit" : "surplus") is \(abs(verdict.actualDeficitKcal)) cal/day; your target needs \(verdict.neededDeficitKcal) cal/day. Eat about \(abs(verdict.adjustKcal)) cal/day \(verdict.adjustKcal > 0 ? "less" : "more") to hit it.")
            }
        }()
        return alertCard(icon: icon, title: title, body: body)
    }

    /// Weight's own inline "Weekly recap" card (coral, fixed ink) — ports
    /// weight.tsx's inline recap Card, distinct from Today's imported
    /// `MondayNoteCard` component (lilac, richer verdict-chip/audit/dismiss
    /// content, Today-only per its own doc comment). RN confirms these are
    /// two different renderings of the same `recap` data, not the same
    /// component reused.
    private func recapCard(_ recap: WeeklyRecap) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text("Weekly recap").font(.system(size: 24, weight: .black)).foregroundStyle(.black)
            Text("Week of \(Self.weekOfLabel(recap.weekStart))").font(Theme.Typography.caption11).foregroundStyle(.black.opacity(0.6))
            Text(recap.content).font(.system(size: 14)).foregroundStyle(.black).padding(.top, Theme.Spacing.xs)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.m)
        .background(Theme.blockCoral)
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }

    /// Ports ui.tsx's `Alert` component (icon + title + body row, `bg-card`
    /// + hairline/destructive-tinted border) — DESIGN.md's component
    /// inventory lists "Alert / notice card" with default/destructive
    /// states; used here for the stale-weigh-in nudge, the load error, and
    /// the verdict card, matching RN's three call sites.
    private func alertCard(icon: String, title: String, body: String, destructive: Bool = false) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.cluster) {
            Image(systemName: icon).foregroundStyle(destructive ? Theme.destructive : Theme.foreground)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 15, weight: .bold)).foregroundStyle(destructive ? Theme.destructive : Theme.foreground)
                Text(body).font(.system(size: 14)).foregroundStyle(Theme.mutedForeground)
            }
        }
        .padding(Theme.Spacing.m)
        .background(Theme.card)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(destructive ? Theme.destructive.opacity(0.3) : Theme.hairline, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private static func parseCalendarDate(_ date: String) -> Date? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = .current
        return f.date(from: date)
    }

    /// "yyyy-MM-dd" -> "7/20", matches RN's chart x-axis label formatting
    /// (`toLocaleDateString([], { month: "numeric", day: "numeric" })`).
    private static func chartLabel(_ date: String) -> String {
        guard let d = parseCalendarDate(date) else { return date }
        let out = DateFormatter()
        out.dateFormat = "M/d"
        out.locale = Locale(identifier: "en_US_POSIX")
        out.timeZone = .current
        return out.string(from: d)
    }

    /// "yyyy-MM-dd" -> "July 12", matches RN's recap-card week-of label
    /// (`toLocaleDateString([], { month: "long", day: "numeric" })`).
    private static func weekOfLabel(_ date: String) -> String {
        guard let d = parseCalendarDate(date) else { return date }
        let out = DateFormatter()
        out.dateFormat = "MMMM d"
        out.locale = Locale(identifier: "en_US_POSIX")
        out.timeZone = .current
        return out.string(from: d)
    }
}

/// Manual weigh-in entry sheet. Ports the visible-content half of
/// log-weight-drawer.tsx (title, caption, weight field, Save). Deliberately
/// scoped to today's date only, matching this task's brief ("manual entry
/// only") — RN's own drawer also lets the date be edited, but that's a
/// meaningful scope increase (validation, defaults, backdating semantics)
/// not requested here and not needed for a first manual weigh-in flow; the
/// server already upserts by date, so a future date-editing pass is a pure
/// additive change, not a rework.
private struct LogWeightSheet: View {
    let imperial: Bool
    var onSave: (Double) async -> Bool
    @State private var text = ""
    @State private var saving = false
    @State private var errorMessage: String?
    @Environment(\.dismiss) private var dismiss

    private var unit: String { imperial ? "lb" : "kg" }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text("Log your weight").font(.system(size: 20, weight: .black)).foregroundStyle(Theme.foreground)
                    Text("Weigh in at the same time each day (first thing in the morning is best) for the smoothest trend.")
                        .font(.system(size: 14)).foregroundStyle(Theme.mutedForeground)
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text("Weight (\(unit))").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.mutedForeground)
                    TextField(imperial ? "e.g. 176.4" : "e.g. 80.1", text: $text)
                        .keyboardType(.decimalPad)
                        .padding(Theme.Spacing.s)
                        .background(Theme.muted)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.hairline, lineWidth: 1))
                }
                if let errorMessage {
                    Text(errorMessage).font(Theme.Typography.caption11).foregroundStyle(Theme.destructive)
                }
                Button {
                    guard let v = Double(text), v > 0 else {
                        errorMessage = "Enter a valid weight"
                        return
                    }
                    errorMessage = nil
                    let kg = imperial ? v * kgPerLb : v
                    Task {
                        saving = true
                        let ok = await onSave(kg)
                        saving = false
                        if !ok { errorMessage = "Couldn't save" }
                    }
                } label: {
                    Text(saving ? "Saving…" : "Save")
                        .font(.system(size: 16, weight: .bold))
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(Theme.primaryText)
                        .background(Theme.primaryFill)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }
                .disabled(saving || Double(text) == nil)
                Spacer()
            }
            .padding(Theme.Spacing.l)
            .background(Theme.background)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}
