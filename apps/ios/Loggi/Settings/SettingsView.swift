import SwiftUI
import ClerkKit

private let kgPerLb = 0.453592

/// decimal-pad yields "," in some locales; Double("0,5") is nil. Mirrors
/// settings.tsx's `num()`.
private func parseDecimal(_ s: String) -> Double? {
    Double(s.replacingOccurrences(of: ",", with: "."))
}
private func round2(_ x: Double) -> Double { (x * 100).rounded() / 100 }
private func round1(_ x: Double) -> Double { (x * 10).rounded() / 10 }
/// Formats a Double the way JS's `String(n)` would for our rounded inputs —
/// no trailing zeros/decimal point (Swift's `String(Double)` always prints
/// e.g. "1.0", JS prints "1").
private func fmtTrim(_ x: Double, decimals: Int) -> String {
    var s = String(format: "%.\(decimals)f", x)
    while s.contains("."), s.hasSuffix("0") { s.removeLast() }
    if s.hasSuffix(".") { s.removeLast() }
    return s
}

private let macroPresets: [(label: String, proteinPct: Int, carbsPct: Int, fatPct: Int)] = [
    ("Balanced", 30, 40, 30),
    ("High protein", 40, 30, 30),
    ("Low carb", 35, 25, 40),
]

// MealCache.shared/APIClient.shared are @MainActor-isolated (MealCache) /
// safe to call cross-actor (APIClient is a stateless struct) — same
// isolation reasoning as TodayViewModel/WeightViewModel's documented pattern.
@MainActor
@Observable
final class SettingsViewModel {
    var goals: Goals?
    var loadError = false
    /// Context for the smart-goal status line and the goal-card's "current
    /// weight" caption — pulled from the shared trends cache instantly (like
    /// settings.tsx's `getCachedTrends`), refreshed in the background.
    var currentKg: Double?
    var adaptiveKcal: Int?
    /// True once trends data (cache or live) has actually arrived — the
    /// smart-goal status line stays hidden until then, matching RN's
    /// `goals.adaptive_goal && trends ? ... : null` gate (nil `adaptiveKcal`
    /// alone doesn't distinguish "not loaded yet" from "collecting data").
    var trendsLoaded = false

    func load() async {
        if let cached = MealCache.shared.cachedGoals() { goals = cached; return }
        do {
            let g: Goals = try await APIClient.shared.get("/api/goals")
            goals = g
            MealCache.shared.setGoals(g)
            loadError = false
        } catch { loadError = true }
    }

    func loadTrendsContext() async {
        if let cached = MealCache.shared.trends {
            currentKg = cached.weights.last?.trendKg
            adaptiveKcal = cached.adaptiveGoalKcal
            trendsLoaded = true
        }
        do {
            let t: TrendsResponse = try await APIClient.shared.get("/api/trends", query: [
                "days": "90", "tz_offset": String(tzOffsetMinutes()),
            ])
            MealCache.shared.setTrends(t)
            currentKg = t.weights.last?.trendKg
            adaptiveKcal = t.adaptiveGoalKcal
            trendsLoaded = true
        } catch { /* Settings degrades gracefully without trends context, matching Today/Weight's pattern */ }
    }

    /// PUT /api/goals — goals are a singleton resource updated in place
    /// (settings.tsx's `put()`), unlike meals' POST-to-create.
    @discardableResult
    func save(_ next: Goals) async -> Bool {
        do {
            var saved: Goals = try await APIClient.shared.put("/api/goals", body: next)
            // The deployed API omits `adaptive_goal` from its response, so it
            // decodes back as false and snaps the Smart-goal toggle off. Keep
            // the value we just sent (and cache it, so a relaunch honours it).
            saved.adaptiveGoal = next.adaptiveGoal
            goals = saved
            MealCache.shared.setGoals(saved)
            return true
        } catch { return false }
    }
}

/// Settings — "Control room." This task ports the Goal/Targets/Smart-goal/
/// Units cards only (DESIGN.md §4.3's Settings bullet, up through "Units...
/// no lost edits)"). `ProfileSection` (Task 7) and Your-data/account-actions
/// (Task 8) append to this same file's body below. The Monday-note/Evening-
/// reminder/Apple-Health cards named later in that same DESIGN.md bullet are
/// local-notification/HealthKit features — deferred to Phase 4, matching the
/// already-established deferral precedent (WeightView's own doc comment;
/// Task 4/5 reports) rather than a new decision made here.
struct SettingsView: View {
    @State private var vm = SettingsViewModel()
    @State private var showRedoConfirm = false
    @State private var showOnboarding = false
    @Environment(Clerk.self) private var clerk

    private var imperial: Bool { vm.goals?.unitSystem == .imperial }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme2.Space.l) {
                VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                    Text("Control room").font(Theme2.Text.kicker).foregroundStyle(Theme2.inkSecondary)
                    Text("Settings").font(Theme2.Text.headline36).foregroundStyle(Theme2.ink)
                }
                if let goals = vm.goals {
                    // Goal + targets are set only by the questionnaire now — this
                    // is a read-only summary with a "redo" entry point.
                    planCard(goals)
                    smartGoalCard(goals)
                    unitsCard(goals)
                    dataAndAccountCard()
                } else if vm.loadError {
                    retryState
                } else {
                    skeleton
                }
            }
            .padding(Theme2.Space.l)
            .padding(.bottom, 96)
        }
        .background(Theme2.canvas)
        .task {
            async let g: () = vm.load()
            async let t: () = vm.loadTrendsContext()
            _ = await (g, t)
        }
        .fullScreenCover(isPresented: $showOnboarding) {
            OnboardingView(seedGoals: vm.goals, seedWeightKg: vm.currentKg) {
                showOnboarding = false
                Task { await vm.load() }
            }
        }
    }

    // MARK: - Plan card (read-only summary + redo entry point)

    private func planCard(_ goals: Goals) -> some View {
        VStack(alignment: .leading, spacing: Theme2.Space.m) {
            HStack(spacing: Theme2.Space.s) {
                Image(systemName: "target").foregroundStyle(Theme2.blockInk)
                Text("Your plan").font(Theme2.Text.title).foregroundStyle(Theme2.blockInk)
            }
            Text("\(goals.dailyCalories.formatted()) cal a day")
                .font(Theme2.Text.hero).foregroundStyle(Theme2.blockInk)
                .minimumScaleFactor(0.5).lineLimit(1)
            Text("P \(goals.dailyProteinG)g · C \(goals.dailyCarbsG)g · F \(goals.dailyFatG)g")
                .font(Theme2.Text.label).foregroundStyle(Theme2.blockInkSecondary)
            Text(planGoalSummary(goals))
                .font(Theme2.Text.caption).foregroundStyle(Theme2.blockInkSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Button { showRedoConfirm = true } label: {
                Text("Redo your plan")
                    .font(Theme2.Text.label).foregroundStyle(Theme2.blockInk)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(Color.white.opacity(0.6), in: Capsule())
            }
            .confirmationDialog("Redo your plan?", isPresented: $showRedoConfirm, titleVisibility: .visible) {
                Button("Redo the questionnaire") { showOnboarding = true }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You'll answer the questions again and your daily targets will be recalculated from your new answers.")
            }
        }
        .padding(Theme2.Space.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme2.Block.cream)
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private func planGoalSummary(_ goals: Goals) -> String {
        let rate = goals.targetRateKgPerWk
        if rate == 0 { return "Maintaining your weight. Change anything by redoing the questionnaire." }
        let dir = rate < 0 ? "Losing" : "Gaining"
        let perWeek = imperial ? abs(rate) / 0.453592 : abs(rate)
        let unit = imperial ? "lb" : "kg"
        return "\(dir) about \(String(format: "%g", (perWeek * 100).rounded() / 100)) \(unit)/week."
    }

    private var skeleton: some View {
        RoundedRectangle(cornerRadius: 24).fill(Theme2.hairline).frame(height: 288)
    }

    private var retryState: some View {
        VStack(spacing: Theme2.Space.m) {
            Text("Couldn't load your settings").font(Theme2.Text.title).foregroundStyle(Theme2.ink)
            Text("Check your connection and try again.")
                .font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary).multilineTextAlignment(.center)
            Button {
                Task { await vm.load() }
            } label: {
                Text("Retry").font(Theme2.Text.label).foregroundStyle(Theme2.canvas)
                    .padding(.horizontal, Theme2.Space.l)
                    .frame(minHeight: 44)
                    .background(Theme2.ink)
                    .clipShape(Capsule())
            }
        }
        .frame(maxWidth: .infinity).padding(32).background(Theme2.surface).clipShape(RoundedRectangle(cornerRadius: 24))
    }

    // MARK: - Smart goal card

    private func smartGoalCard(_ goals: Goals) -> some View {
        VStack(alignment: .leading, spacing: Theme2.Space.s) {
            HStack {
                HStack(spacing: Theme2.Space.s) {
                    Image(systemName: "chart.line.downtrend.xyaxis").foregroundStyle(Theme2.ink)
                    Text("Smart calorie goal").font(Theme2.Text.title).foregroundStyle(Theme2.ink)
                }
                Spacer()
                Toggle("", isOn: Binding(
                    get: { vm.goals?.adaptiveGoal ?? false },
                    set: { v in
                        guard var next = vm.goals else { return }
                        next.adaptiveGoal = v
                        vm.goals = next            // optimistic — the toggle moves now
                        Task { await vm.save(next) } // persist in the background
                    }))
                    .labelsHidden()
                    .tint(Theme2.ink)
                    .accessibilityLabel("Smart calorie goal")
            }
            Text("Recalculates your daily calories every Monday from your weight trend — your measured burn rate minus what your target rate needs. Falls back to the manual target above until there's enough logging history.")
                .font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary)
            if let status = smartGoalStatus(goals) {
                Text(status).font(Theme2.Text.label).foregroundStyle(Theme2.ink).monospacedDigit()
            }
        }
        .padding(Theme2.Space.l).background(Theme2.surface).clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private func smartGoalStatus(_ goals: Goals) -> String? {
        guard goals.adaptiveGoal, vm.trendsLoaded else { return nil }
        if let kcal = vm.adaptiveKcal {
            return "Active — \(kcal) cal/day right now. Recalculates Monday."
        }
        return "Collecting data — using your manual target until there's about two weeks of logging."
    }

    // MARK: - Units card

    private func unitsCard(_ goals: Goals) -> some View {
        VStack(alignment: .leading, spacing: Theme2.Space.m) {
            HStack(spacing: Theme2.Space.s) {
                Image(systemName: "slider.horizontal.3").foregroundStyle(Theme2.ink)
                Text("Units").font(Theme2.Text.title).foregroundStyle(Theme2.ink)
            }
            SegmentedToggle(
                options: [("Metric — kg, cm", UnitSystem.metric), ("Imperial — lb, ft/in", UnitSystem.imperial)],
                selection: Binding(
                    get: { goals.unitSystem },
                    set: { v in var next = goals; next.unitSystem = v; Task { await vm.save(next) } }))
        }
        .padding(Theme2.Space.l).background(Theme2.surface).clipShape(RoundedRectangle(cornerRadius: 24))
    }

    // MARK: - Profile section

    @State private var sex: Sex?
    @State private var ageText = ""
    @State private var activity: ActivityLevel?
    @State private var heightCmText = ""

    /// Ports settings.tsx's `ProfileSection`: sex/age/height/activity-level
    /// inputs feeding a live Mifflin-St Jeor BMR/TDEE readout (Bmr.swift,
    /// Task 6). Deliberate, disclosed scope reduction vs RN (task-7-report.md):
    /// RN shows dual ft/in fields when `imperial` and converts them in place;
    /// this port keeps a single cm field always, since `height_cm` is the only
    /// value actually stored and Phase 2's bar is daily-use parity, not
    /// pixel-perfect form parity — the field label calls this out to imperial
    /// users instead of silently reinterpreting their input as feet/inches.
    private func profileSection(_ goals: Goals) -> some View {
        let imperial = goals.unitSystem == .imperial
        let cm = Double(heightCmText) ?? 0
        let age = Int(ageText) ?? 0
        let burn: Double? = {
            guard let sex, age > 0, cm > 0, let activity, let currentKg = vm.currentKg else { return nil }
            return estimatedTdee(bmr: bmrMifflinStJeor(sex: sex, weightKg: currentKg, heightCm: cm, age: age), activity: activity)
        }()
        // Ported from settings.tsx's `warn` — the ft/in-overflow branch is
        // dropped along with the ft/in fields themselves (see doc comment
        // above); age/height sanity ranges are kept since they're cheap and
        // "port not redesign" is binding. `Theme2.statusOver` (dynamic), not
        // `destructiveFixed` — this card sits on `Theme2.surface`, not a pastel
        // block, so it must invert with the system theme like every other
        // warning in this file (GoalCard's fixed-ink warnings are the
        // pastel-only exception, not the default).
        let warn: String? = {
            if age > 0, age < 13 || age > 100 { return "Double-check the age — Loggi expects 13–100." }
            if cm > 0, cm < 90 || cm > 250 { return "Double-check the height — that's outside the human range." }
            return nil
        }()

        return VStack(alignment: .leading, spacing: Theme2.Space.m) {
            HStack(spacing: Theme2.Space.s) {
                Image(systemName: "person").foregroundStyle(Theme2.ink)
                Text("Your profile").font(Theme2.Text.title).foregroundStyle(Theme2.ink)
            }
            Text("Used to estimate how many calories you burn.").font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary)

            VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                Text("Sex").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                SegmentedToggle(options: [("Male", Sex?.some(.male)), ("Female", Sex?.some(.female))], selection: $sex)
            }

            HStack(spacing: Theme2.Space.m) {
                VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                    Text("Age").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                    TextField("", text: $ageText).keyboardType(.numberPad).monospacedDigit()
                        .padding(Theme2.Space.s).background(Theme2.hairline).clipShape(RoundedRectangle(cornerRadius: 16))
                }
                VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                    Text(imperial ? "Height (cm — imperial not yet supported)" : "Height (cm)")
                        .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                    TextField("", text: $heightCmText).keyboardType(.numberPad).monospacedDigit()
                        .padding(Theme2.Space.s).background(Theme2.hairline).clipShape(RoundedRectangle(cornerRadius: 16))
                }
            }

            VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                Text("Activity level").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                VStack(alignment: .leading, spacing: Theme2.Space.s) {
                    ForEach(activityLevels, id: \.value) { level in
                        Button {
                            activity = level.value
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(level.label).font(Theme2.Text.label)
                                Text(level.description).font(Theme2.Text.caption).opacity(0.7)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(Theme2.Space.s)
                        }
                        .foregroundStyle(activity == level.value ? Theme2.canvas : Theme2.ink)
                        .background(activity == level.value ? Theme2.ink : Theme2.surface)
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(activity == level.value ? Color.clear : Theme2.hairline, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                }
            }

            if let warn {
                Text(warn).font(Theme2.Text.caption).foregroundStyle(Theme2.statusOver).monospacedDigit()
            } else if let burn {
                Text("Estimated burn: ~\(Int(burn)) cal/day at your current weight.")
                    .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary).monospacedDigit()
            } else {
                Text("Fill everything in\(vm.currentKg == nil ? " and log a weigh-in" : "") to see your estimated daily burn.")
                    .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
            }

            SaveButton(label: "Save profile") {
                var next = goals
                next.sex = sex
                next.age = age > 0 ? age : nil
                next.heightCm = cm > 0 ? cm : nil
                next.activityLevel = activity
                return await vm.save(next)
            }
        }
        .padding(Theme2.Space.l).background(Theme2.surface).clipShape(RoundedRectangle(cornerRadius: 24))
        .onAppear {
            sex = goals.sex
            ageText = goals.age.map(String.init) ?? ""
            activity = goals.activityLevel
            heightCmText = goals.heightCm.map { String(Int($0.rounded())) } ?? ""
        }
    }

    // MARK: - Data + account

    @State private var exportedJSONURL: URL?
    @State private var exportedCSVURL: URL?
    @State private var exporting = false
    @State private var deleteConfirmText = ""
    @State private var showDeleteConfirm = false
    @State private var showLogoutConfirm = false
    @State private var deleteFailed = false

    private struct AccountExport: Decodable {
        let meals: [ApiMeal]
    }

    /// Port of packages/shared/src/csv.ts's `csvField` (RFC 4180 quoting).
    /// Meal and item names are free text — AI-generated from a photo — so an
    /// unescaped comma in "Chicken, rice and beans" shifts every later column
    /// in that row and silently corrupts the user's export.
    private func csvField(_ v: String) -> String {
        guard v.rangeOfCharacter(from: CharacterSet(charactersIn: "\",\n\r")) != nil else { return v }
        return "\"\(v.replacingOccurrences(of: "\"", with: "\"\""))\""
    }

    /// Ports settings.tsx's `exportData`: both shapes built client-side from
    /// a single `GET /api/account`, JSON being the whole payload and CSV
    /// flattening meals to one row per item. RN shares one `exporting` flag
    /// across both buttons (not per-button); kept identical here rather than
    /// "fixing" it into two flags.
    private func exportData(csv: Bool) async {
        exporting = true
        defer { exporting = false }
        do {
            let raw = try await APIClient.shared.getRaw("/api/account")
            let body: String
            let filename: String
            if csv {
                let data = try JSONDecoder().decode(AccountExport.self, from: raw)
                var rows = ["date,time,meal,item,portion,calories,protein_g,carbs_g,fat_g,planned,source"]
                for meal in data.meals.sorted(by: { $0.eatenAt < $1.eatenAt }) {
                    guard let eaten = parseAPIDate(meal.eatenAt) else { continue }
                    let date = localDateString(eaten)
                    let comps = Calendar.current.dateComponents([.hour, .minute], from: eaten)
                    let time = String(format: "%02d:%02d", comps.hour ?? 0, comps.minute ?? 0)
                    for item in meal.items {
                        rows.append([date, time, meal.name, item.name, item.portion, String(item.calories),
                                     item.proteinG, item.carbsG, item.fatG, String(meal.planned), meal.source]
                            .map(csvField)
                            .joined(separator: ","))
                    }
                }
                body = rows.joined(separator: "\r\n") + "\r\n"
                filename = "loggi-meals-\(localDateString()).csv"
            } else {
                // Re-serialize the SERVER's payload, not a typed subset: the
                // route returns exported_at/goals/meals/weights/weekly_recaps,
                // so encoding `AccountExport.meals` would ship a fifth of the
                // account under a button that says "Export all" — and would
                // keep silently dropping whatever the API adds next. Matches
                // settings.tsx's JSON.stringify(data, null, 2). Keys are
                // sorted (JSONSerialization won't preserve server order) so
                // successive exports at least diff cleanly.
                let object = try JSONSerialization.jsonObject(with: raw)
                let pretty = try JSONSerialization.data(withJSONObject: object,
                                                        options: [.prettyPrinted, .sortedKeys])
                body = String(data: pretty, encoding: .utf8) ?? "{}"
                filename = "loggi-export-\(localDateString()).json"
            }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
            try body.write(to: url, atomically: true, encoding: .utf8)
            if csv { exportedCSVURL = url } else { exportedJSONURL = url }
        } catch {
            // Export failure: no file is produced, so the ShareLink below
            // simply has nothing to share yet — matches RN's silent-retry
            // affordance (tap the button again) rather than surfacing an alert.
        }
    }

    /// Ports settings.tsx's "Your data" card (DESIGN.md §4.3: "dated JSON
    /// export + meals CSV ... log-out confirm, type-DELETE two-step account
    /// deletion. Danger actions visually separated."). Account deletion here
    /// mirrors RN exactly: `DELETE /api/account` (server wipes meals/weights/
    /// goals/profile) then `clerk.auth.signOut()` — no client-side
    /// `Clerk.shared.user?.delete()` call, matching RN's `confirmDeleteAccount`
    /// (settings.tsx) which never touches the Clerk SDK for deletion, only
    /// the backend route + signOut(). (`User.delete()` was verified to exist
    /// in the resolved SDK source — clerk-ios Domains/User/User.swift, bottom
    /// of file, `@discardableResult @MainActor public func delete() async
    /// throws -> DeletedObject` — in case a future task wants full Clerk
    /// identity deletion; deliberately not invoked here to stay at RN parity.)
    private func dataAndAccountCard() -> some View {
        VStack(alignment: .leading, spacing: Theme2.Space.m) {
            HStack(spacing: Theme2.Space.s) {
                Image(systemName: "shield").foregroundStyle(Theme2.ink)
                Text("Your data").font(Theme2.Text.title).foregroundStyle(Theme2.ink)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Signed in as").font(Theme2.Text.kicker).foregroundStyle(Theme2.inkSecondary)
                Text(clerk.user?.primaryEmailAddress?.emailAddress ?? "—")
                    .font(Theme2.Text.body).foregroundStyle(Theme2.ink)
            }
            Text("Everything you log belongs to you — take a full copy anytime, or erase it all for good.")
                .font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary)

            HStack(spacing: Theme2.Space.s) {
                Button {
                    Task { await exportData(csv: false) }
                } label: {
                    HStack(spacing: Theme2.Space.xs) {
                        if exporting {
                            ProgressView()
                        } else {
                            Image(systemName: "square.and.arrow.down")
                            Text("Export all (JSON)").font(Theme2.Text.label).lineLimit(1)
                        }
                    }
                    .foregroundStyle(Theme2.ink)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Theme2.hairline, in: Capsule())
                }
                .disabled(exporting)

                Button {
                    Task { await exportData(csv: true) }
                } label: {
                    HStack(spacing: Theme2.Space.xs) {
                        if exporting {
                            ProgressView()
                        } else {
                            Image(systemName: "tablecells")
                            Text("Meals CSV").font(Theme2.Text.label).lineLimit(1)
                        }
                    }
                    .foregroundStyle(Theme2.ink)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Theme2.hairline, in: Capsule())
                }
                .disabled(exporting)
            }

            if let url = exportedJSONURL {
                ShareLink(item: url) {
                    Label("Share JSON export", systemImage: "square.and.arrow.up")
                }
                .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
            }
            if let url = exportedCSVURL {
                ShareLink(item: url) {
                    Label("Share CSV export", systemImage: "square.and.arrow.up")
                }
                .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
            }

            // Danger actions visually separated (DESIGN.md §4.3).
            Divider().overlay(Theme2.hairline)

            Button {
                showLogoutConfirm = true
            } label: {
                HStack(spacing: Theme2.Space.xs) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                    Text("Log out").font(Theme2.Text.label)
                }
                .foregroundStyle(Theme2.ink)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Theme2.hairline, in: Capsule())
            }
            .confirmationDialog("Log out?", isPresented: $showLogoutConfirm, titleVisibility: .visible) {
                Button("Log out", role: .destructive) { Task { try? await clerk.auth.signOut() } }
                Button("Cancel", role: .cancel) {}
            }

            Button(role: .destructive) {
                deleteFailed = false
                showDeleteConfirm = true
            } label: {
                Text("Delete account")
                    .font(Theme2.Text.label)
                    .foregroundStyle(Theme2.statusOver)
                    .frame(maxWidth: .infinity)
            }
            if deleteFailed {
                Text("Couldn't delete — try again.").font(Theme2.Text.caption).foregroundStyle(Theme2.statusOver)
            }
        }
        .padding(Theme2.Space.l).background(Theme2.surface).clipShape(RoundedRectangle(cornerRadius: 24))
        .alert("Delete account?", isPresented: $showDeleteConfirm) {
            TextField("Type DELETE to confirm", text: $deleteConfirmText)
            Button("Cancel", role: .cancel) { deleteConfirmText = "" }
            Button("Delete forever", role: .destructive) {
                let confirmed = deleteConfirmText.trimmingCharacters(in: .whitespaces).uppercased() == "DELETE"
                deleteConfirmText = ""
                guard confirmed else { return }
                Task {
                    do {
                        try await APIClient.shared.delete("/api/account")
                        try? await clerk.auth.signOut()
                    } catch {
                        deleteFailed = true
                    }
                }
            }
        } message: {
            Text("This permanently erases your meals, weights, goals, and profile. It cannot be undone.")
        }
    }
}

// MARK: - Shared small pieces

private enum SaveState { case idle, saving, saved }

/// Ports settings.tsx's `SaveButton` — its own idle/saving/"Saved ✓" state
/// instead of a native alert on success. On failure, shows an inline caption
/// rather than `RNAlert.alert`: this codebase has no `.alert()` usage
/// anywhere yet (grepped), and WeightView's `LogWeightSheet` already
/// established inline error text as the local convention — followed here
/// rather than introducing a new pattern for one screen.
private struct SaveButton: View {
    let label: String
    var disabled: Bool = false
    let onSave: () async -> Bool
    @State private var state: SaveState = .idle
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.xs) {
            Button {
                failed = false
                Task {
                    state = .saving
                    let ok = await onSave()
                    if ok {
                        state = .saved
                        try? await Task.sleep(nanoseconds: 1_500_000_000)
                        state = .idle
                    } else {
                        state = .idle
                        failed = true
                    }
                }
            } label: {
                Group {
                    if state == .saving {
                        ProgressView().tint(Theme2.canvas)
                    } else {
                        Text(state == .saved ? "Saved ✓" : label).font(Theme2.Text.label)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 44)
                .foregroundStyle(Theme2.canvas)
                .background(Theme2.ink)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .disabled(disabled || state == .saving)
            .opacity(disabled ? 0.5 : 1)
            if failed {
                Text("Couldn't save — try again.").font(Theme2.Text.caption).foregroundStyle(Theme2.statusOver)
            }
        }
    }
}

/// Ports settings.tsx's `OptionRow` pressable-chip pattern (rounded-xl
/// border, active = solid primary fill/text) for direction/rate-preset/
/// macro-preset selection.
private struct Chip: View {
    let label: String
    let selected: Bool
    /// On a theme-fixed pastel card, use fixed ink/paper — themed tokens flip
    /// in dark mode (black chips on cream, §2.2 violation).
    var onPastel: Bool = false
    let action: () -> Void

    private var fg: Color {
        onPastel ? (selected ? .white : .black) : (selected ? Theme2.canvas : Theme2.ink)
    }
    private var bg: Color {
        onPastel ? (selected ? .black : .white) : (selected ? Theme2.ink : Theme2.surface)
    }
    private var border: Color { onPastel ? Color.black.opacity(0.12) : Theme2.hairline }

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(Theme2.Text.caption)
                .lineLimit(1)
                .foregroundStyle(fg)
                .padding(.horizontal, Theme2.Space.l)
                .frame(minHeight: 44)
                .background(bg)
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(selected ? Color.clear : border, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }
}

// MARK: - Goal card

/// Ports settings.tsx's `GoalCard`. Cream pastel card, fixed black ink
/// throughout (per DESIGN.md §2.2 + the Task-2-tracked bug this task must
/// not repeat) — including `Theme2.statusOver` for the mismatch/
/// aggressive-rate warnings, since a *dynamic* destructive token would
/// invert against this card's always-light background in dark mode.
private struct GoalCard: View {
    let goals: Goals
    let imperial: Bool
    let currentKg: Double?
    let onSave: (Goals) async -> Bool

    @State private var direction: String
    @State private var rateText: String
    @State private var goalWeightText: String

    init(goals: Goals, imperial: Bool, currentKg: Double?, onSave: @escaping (Goals) async -> Bool) {
        self.goals = goals
        self.imperial = imperial
        self.currentKg = currentKg
        self.onSave = onSave
        let toDisplay: (Double) -> Double = { imperial ? $0 / kgPerLb : $0 }
        let savedRate = goals.targetRateKgPerWk
        _direction = State(initialValue: savedRate < 0 ? "lose" : (savedRate > 0 ? "gain" : "maintain"))
        _rateText = State(initialValue: savedRate == 0 ? "0.5" : fmtTrim(round2(abs(toDisplay(savedRate))), decimals: 2))
        _goalWeightText = State(initialValue: goals.goalWeightKg.map { fmtTrim(round1(toDisplay($0)), decimals: 1) } ?? "")
    }

    private var unit: String { imperial ? "lb" : "kg" }
    private func toDisplay(_ kg: Double) -> Double { imperial ? kg / kgPerLb : kg }
    private func toKg(_ display: Double) -> Double { imperial ? display * kgPerLb : display }
    private var ratePresets: [String] { imperial ? ["0.5", "1", "1.5", "2"] : ["0.25", "0.5", "0.75", "1"] }

    private var rateKg: Double { toKg(abs(parseDecimal(rateText) ?? 0)) }
    private var goalKg: Double? {
        guard let w = parseDecimal(goalWeightText), w > 0 else { return nil }
        return toKg(w)
    }
    private var mismatch: Bool {
        guard let goalKg, let currentKg, direction != "maintain" else { return false }
        return direction == "lose" ? goalKg > currentKg : goalKg < currentKg
    }
    private var aggressive: Bool { direction != "maintain" && rateKg > 1.1 } // above every preset chip

    /// What the rate means: daily deficit/surplus, and roughly when the
    /// goal lands. Mirrors GoalCard's `summary` memo.
    private var summary: String? {
        guard direction != "maintain", rateKg > 0 else { return nil }
        let cal = abs(deficitForRate(rateKg))
        var text = "≈ \(cal) cal/day \(direction == "lose" ? "deficit" : "surplus")"
        if let goalKg, let currentKg, !mismatch, goalKg != currentKg {
            let weeks = abs(goalKg - currentKg) / rateKg
            let eta = Date().addingTimeInterval(weeks * 7 * 86_400)
            let f = DateFormatter()
            f.dateFormat = "MMMM yyyy"
            f.locale = Locale(identifier: "en_US_POSIX")
            text += " · \(goalWeightText) \(unit) around \(f.string(from: eta))"
        }
        return text
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.m) {
            HStack(spacing: Theme2.Space.s) {
                Image(systemName: "target").foregroundStyle(Theme2.blockInk)
                Text("Your goal").font(Theme2.Text.title).foregroundStyle(Theme2.blockInk)
            }
            VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                Text("Direction").font(Theme2.Text.caption).foregroundStyle(Theme2.blockInkSecondary)
                HStack(spacing: Theme2.Space.s) {
                    Chip(label: "Lose", selected: direction == "lose", onPastel: true) { direction = "lose" }
                    Chip(label: "Maintain", selected: direction == "maintain", onPastel: true) { direction = "maintain" }
                    Chip(label: "Gain", selected: direction == "gain", onPastel: true) { direction = "gain" }
                }
            }
            if direction != "maintain" {
                VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                    Text("Rate (\(unit)/week)").font(Theme2.Text.caption).foregroundStyle(Theme2.blockInkSecondary)
                    HStack(spacing: Theme2.Space.s) {
                        ForEach(ratePresets, id: \.self) { p in
                            Chip(label: p, selected: rateText == p, onPastel: true) { rateText = p }
                        }
                    }
                    TextField("", text: $rateText)
                        .keyboardType(.decimalPad)
                        .monospacedDigit()
                        .foregroundStyle(Theme2.blockInk)
                        .padding(Theme2.Space.s)
                        .background(Color.white.opacity(0.6))
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }
            }
            VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                Text("Goal weight (\(unit), optional)").font(Theme2.Text.caption).foregroundStyle(Theme2.blockInkSecondary)
                TextField("Target to reach", text: $goalWeightText)
                    .keyboardType(.decimalPad)
                    .monospacedDigit()
                    .foregroundStyle(Theme2.blockInk)
                    .padding(Theme2.Space.s)
                    .background(Color.white.opacity(0.6))
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            if mismatch, let currentKg {
                Text("That's \(direction == "lose" ? "above" : "below") your current weight (\(fmtTrim(round1(toDisplay(currentKg)), decimals: 1)) \(unit)) — check the direction.")
                    .font(Theme2.Text.caption).foregroundStyle(Theme2.statusOver).monospacedDigit()
            } else if let currentKg {
                Text("Current weight: \(fmtTrim(round1(toDisplay(currentKg)), decimals: 1)) \(unit)")
                    .font(Theme2.Text.caption).foregroundStyle(Theme2.blockInkSecondary).monospacedDigit()
            }
            if aggressive, let summary {
                Text("\(summary) — that's a lot. Most guidance tops out around \(imperial ? "2 lb" : "1 kg") a week.")
                    .font(Theme2.Text.caption).foregroundStyle(Theme2.statusOver).monospacedDigit()
            } else if let summary {
                Text(summary).font(Theme2.Text.caption).foregroundStyle(Theme2.blockInkSecondary).monospacedDigit()
            }
            SaveButton(label: "Save goal") {
                let mag = abs(parseDecimal(rateText) ?? 0)
                let displayVal = direction == "maintain" ? 0 : (direction == "lose" ? -mag : mag)
                let w = parseDecimal(goalWeightText) ?? 0
                var next = goals
                next.targetRateKgPerWk = round2(toKg(displayVal))
                next.goalWeightKg = (goalWeightText.trimmingCharacters(in: .whitespaces).isEmpty || !(w > 0)) ? nil : round2(toKg(w))
                return await onSave(next)
            }
        }
        .padding(Theme2.Space.l)
        .background(Theme2.Block.cream)
        .clipShape(RoundedRectangle(cornerRadius: 24))
        // Unit flip: convert the drafts in place — no remount, no lost edits
        // (DESIGN.md §4.3: "flipping converts in-progress card drafts in place").
        .onChange(of: imperial) { _, new in
            let factor = new ? 1 / kgPerLb : kgPerLb
            if let r = parseDecimal(rateText), r > 0 { rateText = fmtTrim(round2(r * factor), decimals: 2) }
            if let w = parseDecimal(goalWeightText), w > 0 { goalWeightText = fmtTrim(round1(w * factor), decimals: 1) }
        }
    }
}

// MARK: - Targets card

/// Ports settings.tsx's `TargetsCard`: calories + macros editable as % or
/// grams via segmented toggle, preset splits, live gram/cal readout, Save
/// disabled unless valid; adaptive-goal banner when smart goal is on.
private struct TargetsCard: View {
    let goals: Goals
    let adaptiveKcal: Int?
    let onSave: (Goals) async -> Bool

    @State private var caloriesText: String
    @State private var mode: String // "pct" or "g"
    @State private var proteinPctText: String
    @State private var carbsPctText: String
    @State private var fatPctText: String
    @State private var proteinGText: String
    @State private var carbsGText: String
    @State private var fatGText: String

    init(goals: Goals, adaptiveKcal: Int?, onSave: @escaping (Goals) async -> Bool) {
        self.goals = goals
        self.adaptiveKcal = adaptiveKcal
        self.onSave = onSave
        let saved = macroPercents(calories: goals.dailyCalories, grams: .init(
            proteinG: goals.dailyProteinG, carbsG: goals.dailyCarbsG, fatG: goals.dailyFatG))
        _caloriesText = State(initialValue: String(goals.dailyCalories))
        _mode = State(initialValue: "pct")
        _proteinPctText = State(initialValue: String(saved.proteinPct))
        _carbsPctText = State(initialValue: String(saved.carbsPct))
        _fatPctText = State(initialValue: String(saved.fatPct))
        _proteinGText = State(initialValue: String(goals.dailyProteinG))
        _carbsGText = State(initialValue: String(goals.dailyCarbsG))
        _fatGText = State(initialValue: String(goals.dailyFatG))
    }

    private var cal: Int { Int((Double(caloriesText) ?? 0).rounded()) }
    private var pctNums: MacroPercents {
        .init(proteinPct: Int(Double(proteinPctText) ?? 0),
              carbsPct: Int(Double(carbsPctText) ?? 0),
              fatPct: Int(Double(fatPctText) ?? 0))
    }
    private var gramNums: MacroGrams {
        .init(proteinG: Int((Double(proteinGText) ?? 0).rounded()),
              carbsG: Int((Double(carbsGText) ?? 0).rounded()),
              fatG: Int((Double(fatGText) ?? 0).rounded()))
    }
    private var total: Int { pctNums.proteinPct + pctNums.carbsPct + pctNums.fatPct }
    private var derived: MacroGrams { mode == "pct" ? gramsFromPercents(calories: cal, pcts: pctNums) : gramNums }
    private var macroCal: Int { gramNums.proteinG * 4 + gramNums.carbsG * 4 + gramNums.fatG * 9 }
    private var valid: Bool { cal >= 500 && (mode == "g" || total == 100) }
    private var activePresetLabel: String {
        macroPresets.first {
            $0.proteinPct == pctNums.proteinPct && $0.carbsPct == pctNums.carbsPct && $0.fatPct == pctNums.fatPct
        }?.label ?? ""
    }

    private func switchMode(_ next: String) {
        guard next != mode else { return }
        if next == "g" {
            let g = gramsFromPercents(calories: cal, pcts: pctNums)
            proteinGText = String(g.proteinG); carbsGText = String(g.carbsG); fatGText = String(g.fatG)
        } else {
            let p = macroPercents(calories: cal, grams: gramNums)
            proteinPctText = String(p.proteinPct); carbsPctText = String(p.carbsPct); fatPctText = String(p.fatPct)
        }
        mode = next
    }

    private var validationText: String {
        if cal < 500 { return "Calories must be at least 500." }
        if mode == "pct", total != 100 { return "Percentages add up to \(total)% — they need to total 100%." }
        if mode == "pct" { return "= \(derived.proteinG)g protein · \(derived.carbsG)g carbs · \(derived.fatG)g fat" }
        let extra = abs(macroCal - cal) > 100 ? " — your calorie target is \(cal)" : ""
        return "Macros add up to ~\(macroCal) cal\(extra)"
    }

    private var adaptiveBannerText: String {
        if let kcal = adaptiveKcal {
            return "Currently \(kcal) cal/day, recalculated every Monday — the numbers below are the fallback."
        }
        return "It's still collecting data, so the target below applies for now."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.m) {
            Text("Daily targets").font(Theme2.Text.title).foregroundStyle(Theme2.ink)
            if goals.adaptiveGoal {
                adaptiveBanner
            }
            VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                Text("Calories (cal)").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                TextField("", text: $caloriesText)
                    .keyboardType(.numberPad)
                    .monospacedDigit()
                    .padding(Theme2.Space.s).background(Theme2.hairline).clipShape(RoundedRectangle(cornerRadius: 16))
            }
            HStack {
                Text("Macros").font(Theme2.Text.kicker).foregroundStyle(Theme2.inkSecondary)
                Spacer()
                // Wrapped in an explicit closure, not passed as a bare `set: switchMode`
                // method reference — the latter crashes swift-frontend's IR generation on
                // this exact Picker/Binding(get:set:) combination (Swift 6.3.3, reproduced
                // and confirmed by isolating this one line; verified by build-log stack
                // trace pointing at IRGenRequest for this file). Keep this closure form.
                SegmentedToggle(options: [("%", "pct"), ("grams", "g")],
                                selection: Binding(get: { mode }, set: { switchMode($0) }))
                    .frame(width: 150)
            }
            if mode == "pct" {
                HStack(spacing: Theme2.Space.s) {
                    ForEach(macroPresets, id: \.label) { p in
                        Chip(label: p.label, selected: activePresetLabel == p.label) {
                            proteinPctText = String(p.proteinPct)
                            carbsPctText = String(p.carbsPct)
                            fatPctText = String(p.fatPct)
                        }
                    }
                }
                HStack(spacing: Theme2.Space.m) {
                    macroField("Protein %", $proteinPctText)
                    macroField("Carbs %", $carbsPctText)
                    macroField("Fat %", $fatPctText)
                }
            } else {
                HStack(spacing: Theme2.Space.m) {
                    macroField("Protein g", $proteinGText)
                    macroField("Carbs g", $carbsGText)
                    macroField("Fat g", $fatGText)
                }
            }
            Text(validationText)
                .font(Theme2.Text.caption)
                .foregroundStyle(valid ? Theme2.inkSecondary : Theme2.statusOver)
                .monospacedDigit()
            SaveButton(label: "Save targets", disabled: !valid) {
                var next = goals
                next.dailyCalories = cal
                next.dailyProteinG = derived.proteinG
                next.dailyCarbsG = derived.carbsG
                next.dailyFatG = derived.fatG
                return await onSave(next)
            }
        }
        .padding(Theme2.Space.l).background(Theme2.surface).clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private var adaptiveBanner: some View {
        HStack(alignment: .top, spacing: Theme2.Space.m) {
            Image(systemName: "bolt.fill").foregroundStyle(Theme2.ink)
            VStack(alignment: .leading, spacing: 2) {
                Text("Smart goal is managing calories").font(Theme2.Text.label).foregroundStyle(Theme2.ink)
                Text(adaptiveBannerText).font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary).monospacedDigit()
            }
        }
        .padding(Theme2.Space.l)
        .background(Theme2.surface)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme2.hairline, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func macroField(_ label: String, _ text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: Theme2.Space.xs) {
            Text(label).font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
            TextField("", text: text)
                .keyboardType(.numberPad)
                .monospacedDigit()
                .multilineTextAlignment(.center)
                .padding(Theme2.Space.s).background(Theme2.hairline).clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .frame(maxWidth: .infinity)
    }
}
