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

    private static let figure: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        return f
    }()
    private func fmt(_ value: Double) -> String {
        Self.figure.string(from: NSNumber(value: Int(value.rounded()))) ?? "\(Int(value))"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme2.Space.l) {
                header
                if let days = daysSinceLatest, days >= 4 {
                    alertCard(icon: "exclamationmark.triangle.fill", title: "Time for a weigh-in",
                              body: "Your last weigh-in was \(days) days ago. Log one to keep your trend current.")
                }
                if let err = vm.errorMessage {
                    alertCard(icon: "exclamationmark.triangle.fill", title: "Couldn't load trends", body: err, destructive: true)
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
            .padding(Theme2.Space.l)
            .padding(.bottom, 96)
        }
        .background(Theme2.canvas)
        // DESIGN.md §4.3 Weight: "Pull-to-refresh refetches trends."
        .refreshable { await vm.load() }
        .task { await vm.load() }
        .sheet(isPresented: $vm.logSheetOpen) {
            LogWeightSheet(imperial: imperial) { kg in
                let ok = await vm.logWeight(kg: kg)
                if ok { vm.logSheetOpen = false }
                return ok
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                Text("TREND DESK").font(Theme2.Text.kicker).foregroundStyle(Theme2.inkSecondary)
                Text("Weight").font(Theme2.Text.headline36).foregroundStyle(Theme2.ink)
            }
            Spacer(minLength: Theme2.Space.m)
            Button {
                vm.logSheetOpen = true
            } label: {
                // Explicit canvas-on-ink (both flip together per theme). The old
                // .borderedProminent auto-picked a label color that stayed light
                // on the near-white dark-mode tint — a white-on-white button.
                Label("Log", systemImage: "plus")
                    .font(Theme2.Text.label)
                    .foregroundStyle(Theme2.canvas)
                    .padding(.horizontal, Theme2.Space.l)
                    .frame(minHeight: 44)
                    .background(Theme2.ink, in: Capsule())
            }
            .accessibilityLabel("Log a weigh-in")
        }
    }

    private var skeleton: some View {
        VStack(spacing: Theme2.Space.m) {
            RoundedRectangle(cornerRadius: Theme2.Radius.card, style: .continuous)
                .fill(Theme2.hairline).frame(height: 288)
            HStack(spacing: Theme2.Space.m) {
                RoundedRectangle(cornerRadius: Theme2.Radius.card, style: .continuous)
                    .fill(Theme2.hairline).frame(height: 80)
                RoundedRectangle(cornerRadius: Theme2.Radius.card, style: .continuous)
                    .fill(Theme2.hairline).frame(height: 80)
            }
        }
        .accessibilityLabel("Loading trends")
    }

    private var emptyState: some View {
        SurfaceCard {
            EmptyStateView(
                title: "No weight data yet",
                message: "Tap Log above to add a weigh-in and start your trend.",
                bevi: "bevi-scale")
        }
    }

    /// Cream headline card carries the figure; the CHART sits on the neutral
    /// surface below it. Chart marks aren't validated against pastel grounds
    /// (see PastelCard) — same split History uses.
    private func chartCard(_ data: TrendsResponse) -> some View {
        VStack(alignment: .leading, spacing: Theme2.Space.m) {
            PastelCard(tone: .cream) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                        Text("LATEST WEIGH-IN")
                            .font(Theme2.Text.kicker).foregroundStyle(Theme2.blockInkSecondary)
                        if let latest {
                            Text("\(String(format: "%.1f", toUnit(latest.weightKg))) \(unit)")
                                .font(Theme2.Text.display60)
                                .minimumScaleFactor(0.5)
                                .lineLimit(1)
                            Text("Trend \(String(format: "%.1f", toUnit(latest.trendKg))) \(unit)")
                                .font(Theme2.Text.caption)
                                .foregroundStyle(Theme2.blockInkSecondary)
                        }
                    }
                    Spacer(minLength: Theme2.Space.m)
                    SegmentedToggle(options: [("30d", 30), ("90d", 90)],
                                    selection: $vm.range, onPastel: true)
                        .frame(width: 130)
                }
            }
            SurfaceCard {
                WeightTrendChart(
                    points: chartWeights.map { .init(label: Self.chartLabel($0.date), measured: toUnit($0.weightKg), trend: toUnit($0.trendKg)) },
                    goal: data.goalWeightKg.map(toUnit))
            }
        }
    }

    private func statsRow(_ data: TrendsResponse) -> some View {
        VStack(spacing: Theme2.Space.m) {
            HStack(spacing: Theme2.Space.m) {
                statCard("Current rate", data.rateKgPerWeek.map { "\($0 > 0 ? "+" : "")\(String(format: "%.2f", toUnit($0))) \(unit)/wk" } ?? "—")
                statCard("Maintenance", data.balance.map { "\(fmt(Double($0.tdeeKcal))) cal" } ?? "—")
            }
            if let toGo {
                statCard("To go", toGo == 0 ? "Reached" : "\(String(format: "%.1f", toGo)) \(unit)")
            }
        }
    }

    private func statCard(_ label: String, _ value: String) -> some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                Text(label).font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                Text(value).font(Theme2.Text.figure).foregroundStyle(Theme2.ink)
                    .minimumScaleFactor(0.7).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
    }

    private func verdictCard(_ verdict: Verdict) -> some View {
        let (icon, title, body): (String, String, String) = {
            switch verdict.status {
            case .collecting:
                return ("clock.fill", "Collecting data",
                        "The deficit verdict needs consistent logging first. Still needed: \(verdict.missing.joined(separator: ", ")).")
            case .onTrack:
                return ("checkmark.circle.fill", "On track",
                         "You're averaging a \(fmt(Double(abs(verdict.actualDeficitKcal)))) cal/day \(verdict.actualDeficitKcal >= 0 ? "deficit" : "surplus"), right around the \(fmt(Double(verdict.neededDeficitKcal))) cal/day needed for your target rate.")
            case .adjust:
                return ("exclamationmark.triangle.fill", "Adjust intake",
                         "Your average \(verdict.actualDeficitKcal >= 0 ? "deficit" : "surplus") is \(fmt(Double(abs(verdict.actualDeficitKcal)))) cal/day; your target needs \(fmt(Double(verdict.neededDeficitKcal))) cal/day. Eat about \(fmt(Double(abs(verdict.adjustKcal)))) cal/day \(verdict.adjustKcal > 0 ? "less" : "more") to hit it.")
            }
        }()
        // Status colour is paired with BOTH an icon and the title word —
        // on-track green and adjust red are ~dE 2 apart under deuteranopia,
        // so the wording is what actually carries the verdict.
        let tint: Color? = {
            switch verdict.status {
            case .collecting: return nil
            case .onTrack: return Theme2.statusOnTarget
            case .adjust: return Theme2.statusOver
            }
        }()
        return alertCard(icon: icon, title: title, body: body, tint: tint)
    }

    /// Weight's own inline "Weekly recap" card (coral) — ports weight.tsx's
    /// inline recap Card, distinct from Today's imported `MondayNoteCard`
    /// (lilac, richer content, Today-only). RN confirms these are two
    /// different renderings of the same `recap` data, not one component.
    private func recapCard(_ recap: WeeklyRecap) -> some View {
        PastelCard(tone: .coral) {
            VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                Text("Weekly recap").font(Theme2.Text.title)
                Text("Week of \(Self.weekOfLabel(recap.weekStart))")
                    .font(Theme2.Text.caption).foregroundStyle(Theme2.blockInkSecondary)
                Text(recap.content).font(Theme2.Text.body).padding(.top, Theme2.Space.xs)
            }
        }
    }

    /// Ports ui.tsx's `Alert` (icon + title + body on a card with a hairline
    /// or tinted border). Used for the stale-weigh-in nudge, the load error,
    /// and the verdict card — RN's same three call sites.
    private func alertCard(icon: String, title: String, body: String,
                           destructive: Bool = false, tint: Color? = nil) -> some View {
        let accent = tint ?? (destructive ? Theme2.statusOver : Theme2.ink)
        return SurfaceCard {
            HStack(alignment: .top, spacing: Theme2.Space.m) {
                Image(systemName: icon)
                    .font(Theme2.Text.label)
                    .foregroundStyle(accent)
                VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                    Text(title).font(Theme2.Text.label).foregroundStyle(accent)
                    Text(body).font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary)
                }
            }
            .accessibilityElement(children: .combine)
        }
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
            VStack(alignment: .leading, spacing: Theme2.Space.l) {
                VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                    Text("Log your weight").font(Theme2.Text.title).foregroundStyle(Theme2.ink)
                    Text("Weigh in at the same time each day (first thing in the morning is best) for the smoothest trend.")
                        .font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary)
                }
                VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                    Text("Weight (\(unit))").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                    TextField(imperial ? "e.g. 176.4" : "e.g. 80.1", text: $text)
                        .keyboardType(.decimalPad)
                        .padding(Theme2.Space.s)
                        .background(Theme2.hairline)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme2.hairline, lineWidth: 1))
                }
                if let errorMessage {
                    Text(errorMessage).font(Theme2.Text.caption).foregroundStyle(Theme2.statusOver)
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
                        .font(Theme2.Text.label)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(Theme2.canvas)
                        .background(Theme2.ink)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }
                .disabled(saving || Double(text) == nil)
                Spacer()
            }
            .padding(Theme2.Space.l)
            .background(Theme2.canvas)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}
