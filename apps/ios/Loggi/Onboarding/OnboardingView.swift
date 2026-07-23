import SwiftUI
import AVFoundation
import UIKit

/// First-run wizard. Ports onboarding.tsx faithfully: six steps that turn
/// "who are you" into a calorie and macro plan, then write goals + a first
/// weigh-in. Matches the RN flow — "Plan desk" kicker, a warm Bevi-voiced
/// subtitle per step, ChoiceCard answers, named rate tiers, the Camera/Monday/
/// Health permission asks, and the celebratory result card.
///
/// Without this a new account has no goals, so Today shows a zero budget and
/// the whole app reads as broken — it's the front door, not a nicety.
@MainActor
@Observable
final class OnboardingViewModel {
    enum Step: Int, CaseIterable {
        case you, body, activity, goal, permissions, result
    }
    enum GoalKind: String { case lose, maintain, gain }

    var step: Step = .you
    /// Travel direction, so step content slides in from the right on forward
    /// and the left on back (onboarding.tsx's FadeInRight / FadeInLeft).
    var forward = true
    var saving = false
    var errorMessage: String?

    // Locale guess, overridable — the body step keeps a toggle for everyone
    // the guess misses (same reasoning as onboarding.tsx's localeImperial).
    var imperial: Bool = {
        let locale = Locale.current
        return !(locale.measurementSystem == .metric)
    }()

    var sex: Sex?
    /// Date of birth — age is derived from it (the API stores age, but a date
    /// picker is friendlier and unambiguous). Defaults to ~30 years ago.
    var dob: Date = Calendar.current.date(byAdding: .year, value: -30, to: Date()) ?? Date()
    var heightCm = ""
    var heightFt = ""
    var heightIn = ""
    var weight = ""
    var activity: ActivityLevel?
    var goalKind: GoalKind?
    var rate: Double?

    static let kgPerLb = 0.453592
    static let cmPerIn = 2.54

    var weightKg: Double {
        let value = Double(weight.replacingOccurrences(of: ",", with: ".")) ?? 0
        return imperial ? value * Self.kgPerLb : value
    }
    var resolvedHeightCm: Double {
        if imperial {
            let ft = Double(heightFt) ?? 0
            let inch = Double(heightIn) ?? 0
            return (ft * 12 + inch) * Self.cmPerIn
        }
        return Double(heightCm.replacingOccurrences(of: ",", with: ".")) ?? 0
    }
    var ageValue: Int { Calendar.current.dateComponents([.year], from: dob, to: Date()).year ?? 0 }

    /// Valid birth-date window (13–100 years old), for the date picker's range.
    static var dobRange: ClosedRange<Date> {
        let cal = Calendar.current
        let now = Date()
        let oldest = cal.date(byAdding: .year, value: -100, to: now) ?? now
        let youngest = cal.date(byAdding: .year, value: -13, to: now) ?? now
        return oldest...youngest
    }

    /// Seed from an existing plan so "redo the questionnaire" starts from the
    /// user's current answers instead of blank.
    func prefill(from goals: Goals, weightKg: Double?) {
        imperial = goals.unitSystem == .imperial
        sex = goals.sex
        if let age = goals.age, let d = Calendar.current.date(byAdding: .year, value: -age, to: Date()) { dob = d }
        if let h = goals.heightCm {
            heightCm = trim(h)
            let totalIn = Int((h / Self.cmPerIn).rounded())
            heightFt = String(totalIn / 12); heightIn = String(totalIn % 12)
        }
        if let w = weightKg {
            weight = trim(imperial ? w / Self.kgPerLb : w)
        }
        activity = goals.activityLevel
        let r = goals.targetRateKgPerWk
        if r == 0 { goalKind = .maintain }
        else if r < 0 { goalKind = .lose; rate = abs(r) }
        else { goalKind = .gain; rate = abs(r) }
    }

    /// Maintain means no deficit — the rate picker is hidden for it, so the
    /// effective rate must be zero regardless of what was picked before.
    var effectiveRate: Double {
        guard goalKind != .maintain else { return 0 }
        let magnitude = rate ?? 0.5
        return goalKind == .gain ? magnitude : -magnitude
    }

    var bmr: Double {
        guard let sex, weightKg > 0, resolvedHeightCm > 0, ageValue > 0 else { return 0 }
        return bmrMifflinStJeor(sex: sex, weightKg: weightKg, heightCm: resolvedHeightCm, age: ageValue)
    }
    var tdee: Double {
        guard let activity, bmr > 0 else { return 0 }
        return estimatedTdee(bmr: bmr, activity: activity)
    }
    var plan: (intake: Int, floored: Bool)? {
        guard tdee > 0 else { return nil }
        return suggestedIntake(tdee: tdee, bmr: bmr, targetRateKgPerWk: effectiveRate)
    }
    var macros: MacroGrams? {
        guard let plan else { return nil }
        return suggestedMacros(calories: plan.intake, weightKg: weightKg)
    }

    /// A named rate tier — the honest pace guidance the RN flow leads with,
    /// never a bare number. `rateKg` is the magnitude in kg/week; `effectiveRate`
    /// applies the sign from `goalKind`.
    struct RatePreset: Identifiable {
        var id: Double { rateKg }
        let rateKg: Double
        let title: String
        let blurb: String
        let recommended: Bool
    }

    /// Rounds to at most 2 dp and drops trailing zeros: 0.5, 0.25, 0.125, 1.
    func trim(_ v: Double) -> String {
        let r = (v * 100).rounded() / 100
        return r == r.rounded() ? String(Int(r)) : String(format: "%g", r)
    }

    /// A rate magnitude rendered in the active units, e.g. "0.5 lb" / "0.25 kg".
    func displayRate(_ kg: Double) -> String {
        imperial ? "\(trim(kg / Self.kgPerLb)) lb" : "\(trim(kg)) kg"
    }

    func ratePresets() -> [RatePreset] {
        func label(_ kg: Double) -> String { "\(displayRate(kg))/week" }
        if goalKind == .gain {
            let lean = imperial ? 0.5 * Self.kgPerLb : 0.125
            let fast = imperial ? 1.0 * Self.kgPerLb : 0.25
            return [
                RatePreset(rateKg: lean, title: "Lean gain · \(label(lean))", blurb: "Slow and mostly muscle.", recommended: true),
                RatePreset(rateKg: fast, title: "Faster gain · \(label(fast))", blurb: "Quicker on the scale, some of it will be fat.", recommended: false),
            ]
        }
        let gentle = imperial ? 0.5 * Self.kgPerLb : 0.25
        let steady = imperial ? 1.0 * Self.kgPerLb : 0.5
        let ambitious = imperial ? 1.5 * Self.kgPerLb : 0.75
        return [
            RatePreset(rateKg: gentle, title: "Gentle · \(label(gentle))", blurb: "Small changes you'll barely notice. Easiest to stick with.", recommended: false),
            RatePreset(rateKg: steady, title: "Steady · \(label(steady))", blurb: "The sweet spot for most people.", recommended: true),
            RatePreset(rateKg: ambitious, title: "Ambitious · \(label(ambitious))", blurb: "Faster results, but you'll feel hungry some days.", recommended: false),
        ]
    }

    /// Flipping units converts anything already typed in place — the same
    /// no-lost-edits rule as Settings. A number never gets silently re-labeled.
    func switchUnits(_ next: Bool) {
        guard next != imperial else { return }
        if let w = Double(weight.replacingOccurrences(of: ",", with: ".")), w > 0 {
            weight = trim(next ? w / Self.kgPerLb : w * Self.kgPerLb)
        }
        if next {
            if let cm = Double(heightCm.replacingOccurrences(of: ",", with: ".")), cm > 0 {
                let totalIn = Int((cm / Self.cmPerIn).rounded())
                heightFt = String(totalIn / 12)
                heightIn = String(totalIn % 12)
            }
        } else {
            let totalIn = (Double(heightFt) ?? 0) * 12 + (Double(heightIn) ?? 0)
            if totalIn > 0 { heightCm = trim(totalIn * Self.cmPerIn) }
        }
        imperial = next
    }

    func canContinue(_ step: Step) -> Bool {
        switch step {
        case .you: return sex != nil && ageValue >= 13 && ageValue <= 100
        case .body: return weightKg > 0 && resolvedHeightCm > 0
        case .activity: return activity != nil
        case .goal: return goalKind == .maintain || (goalKind != nil && rate != nil)
        case .permissions, .result: return true
        }
    }

    /// Bevi-voiced nudge shown under a disabled Continue (onboarding.tsx's stepHint).
    func hint(_ step: Step) -> String? {
        switch step {
        case .you: return "Sex and age set the size of the estimate — I need both."
        case .body: return "Height and today's weight — that weigh-in starts your trend."
        case .activity: return "Pick whichever sounds most like your week."
        case .goal: return "Pick a direction — and a pace, if you're losing or gaining."
        case .permissions, .result: return nil
        }
    }

    func next() {
        guard let idx = Step.allCases.firstIndex(of: step), idx + 1 < Step.allCases.count else { return }
        forward = true
        step = Step.allCases[idx + 1]
    }
    func back() {
        guard let idx = Step.allCases.firstIndex(of: step), idx > 0 else { return }
        forward = false
        step = Step.allCases[idx - 1]
    }

    private struct WeightBody: Encodable { let weight_kg: Double }

    /// Writes the first weigh-in and the goals. Both are independent, so they
    /// go in parallel — same as onboarding.tsx's Promise.all.
    func finish() async -> Bool {
        guard let plan, let macros, let sex, let activity else { return false }
        saving = true
        errorMessage = nil
        defer { saving = false }

        var goals = Goals(
            dailyCalories: plan.intake,
            dailyProteinG: macros.proteinG,
            dailyCarbsG: macros.carbsG,
            dailyFatG: macros.fatG,
            targetRateKgPerWk: effectiveRate,
            unitSystem: imperial ? .imperial : .metric,
            sex: sex,
            age: ageValue,
            heightCm: (resolvedHeightCm * 10).rounded() / 10,
            activityLevel: activity,
            onboarded: true,
            goalWeightKg: nil,
            adaptiveGoal: true)

        // The weigh-in is fire-and-forget: it's useful but not load-bearing,
        // and failing it must not cost the user their whole plan.
        let kg = (weightKg * 100).rounded() / 100
        Task {
            let _: EmptyResponse? = try? await APIClient.shared.post(
                "/api/weights", body: WeightBody(weight_kg: kg))
            await HealthService.write(weightKg: kg)
        }

        do {
            let saved: Goals = try await APIClient.shared.put("/api/goals", body: goals)
            goals = saved
            MealCache.shared.setGoals(saved)
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "Couldn't save your plan — your answers are still here, give it another go."
            return false
        }
    }
}

/// The weigh-in POST returns a body we don't need; this satisfies the generic
/// without inventing a model for a value that's discarded.
private struct EmptyResponse: Decodable {}

struct OnboardingView: View {
    @State private var vm: OnboardingViewModel
    @State private var camState: PermState = .idle
    @State private var notifState: PermState = .idle
    @State private var healthState: PermState = .idle
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var onFinished: () -> Void

    /// First run passes no seed. "Redo your plan" from Settings passes the
    /// current goals + weight so the questionnaire opens on the user's answers.
    init(seedGoals: Goals? = nil, seedWeightKg: Double? = nil, onFinished: @escaping () -> Void) {
        self.onFinished = onFinished
        let model = OnboardingViewModel()
        if let seedGoals { model.prefill(from: seedGoals, weightKg: seedWeightKg) }
        _vm = State(initialValue: model)
    }

    private static let figure: NumberFormatter = {
        let f = NumberFormatter(); f.numberStyle = .decimal; return f
    }()
    private func fmt(_ n: Int) -> String {
        Self.figure.string(from: NSNumber(value: n)) ?? "\(n)"
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(alignment: .leading, spacing: Theme2.Space.l) {
                    stepContent
                }
                .padding(Theme2.Space.l)
                .frame(maxWidth: .infinity, alignment: .leading)
                .id(vm.step)
                .transition(.asymmetric(
                    insertion: .move(edge: vm.forward ? .trailing : .leading).combined(with: .opacity),
                    removal: .opacity))
            }
            footer
        }
        .background(Theme2.canvas)
        .onAppear { syncCameraState() }
    }

    // MARK: - Chrome

    private var topBar: some View {
        let idx = OnboardingViewModel.Step.allCases.firstIndex(of: vm.step) ?? 0
        return HStack(spacing: Theme2.Space.m) {
            if vm.step != .you {
                Button { withAnimation(reduceMotion ? nil : Theme2.Motion.standard) { vm.back() } } label: {
                    Image(systemName: "arrow.left")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(Theme2.ink)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Back")
            } else {
                Color.clear.frame(width: 44, height: 44)
            }
            HStack(spacing: 6) {
                ForEach(0..<OnboardingViewModel.Step.allCases.count, id: \.self) { i in
                    Capsule()
                        .fill(i <= idx ? Theme2.ink : Theme2.hairline)
                        .frame(height: 6)
                }
            }
        }
        .padding(.horizontal, Theme2.Space.l)
        .padding(.top, Theme2.Space.s)
        .accessibilityLabel("Step \(idx + 1) of \(OnboardingViewModel.Step.allCases.count)")
    }

    @ViewBuilder private var stepContent: some View {
        switch vm.step {
        case .you: youStep
        case .body: bodyStep
        case .activity: activityStep
        case .goal: goalStep
        case .permissions: permissionsStep
        case .result: resultStep
        }
    }

    private var footer: some View {
        VStack(spacing: Theme2.Space.s) {
            if vm.step != .result, !vm.canContinue(vm.step), let hint = vm.hint(vm.step) {
                Text(hint)
                    .font(Theme2.Text.caption)
                    .foregroundStyle(Theme2.inkSecondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
            Button {
                if vm.step == .result {
                    Task { if await vm.finish() { onFinished() } }
                } else {
                    withAnimation(reduceMotion ? nil : Theme2.Motion.standard) { vm.next() }
                }
            } label: {
                HStack(spacing: Theme2.Space.s) {
                    if vm.saving { ProgressView().tint(Theme2.canvas) }
                    Text(vm.step == .result ? "Start tracking" : "Continue")
                        .font(Theme2.Text.label)
                }
                .foregroundStyle(Theme2.canvas)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(Theme2.ink, in: Capsule())
                .opacity((vm.canContinue(vm.step) && !vm.saving) ? 1 : 0.4)
            }
            .disabled(!vm.canContinue(vm.step) || vm.saving)
        }
        .padding(Theme2.Space.l)
        .background(Theme2.surface)
    }

    // MARK: - Shared step pieces

    private func header(_ title: String, _ subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: Theme2.Space.xs) {
            Text("PLAN DESK").font(Theme2.Text.kicker).foregroundStyle(Theme2.inkSecondary)
            Text(title).font(Theme2.Text.headline36).foregroundStyle(Theme2.ink)
            Text(subtitle)
                .font(Theme2.Text.label)
                .foregroundStyle(Theme2.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Theme2.Space.xs)
        }
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text.uppercased()).font(Theme2.Text.kicker).foregroundStyle(Theme2.inkSecondary)
    }

    private func input(_ placeholder: String, _ text: Binding<String>, _ keyboard: UIKeyboardType) -> some View {
        TextField(placeholder, text: text)
            .keyboardType(keyboard)
            .font(Theme2.Text.body)
            .foregroundStyle(Theme2.ink)
            .padding(.horizontal, Theme2.Space.l)
            .padding(.vertical, Theme2.Space.m)
            .background(Theme2.hairline)
            .clipShape(RoundedRectangle(cornerRadius: Theme2.Radius.control, style: .continuous))
    }

    // MARK: - Steps

    private var youStep: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.l) {
            header("About you", "A few quick questions and I'll work out your starting numbers. Sex and age first — your body burns calories all day, even asleep, and they size that estimate.")
            HStack(spacing: Theme2.Space.m) {
                ChoiceCard(title: "Male", selected: vm.sex == .male) { vm.sex = .male }
                ChoiceCard(title: "Female", selected: vm.sex == .female) { vm.sex = .female }
            }
            Text("The formula only knows these two — pick whichever is closest.")
                .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
            VStack(alignment: .leading, spacing: Theme2.Space.s) {
                fieldLabel("Date of birth")
                DatePicker("", selection: $vm.dob, in: OnboardingViewModel.dobRange, displayedComponents: .date)
                    .labelsHidden()
                    .datePickerStyle(.compact)
                    .tint(Theme2.ink)
            }
        }
    }

    private var bodyStep: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.l) {
            header("Your body", "Bigger bodies burn more calories. This weigh-in also becomes the first point on your trend.")
            HStack(spacing: Theme2.Space.m) {
                ChoiceCard(title: "kg · cm", selected: !vm.imperial) { vm.switchUnits(false) }
                ChoiceCard(title: "lb · ft", selected: vm.imperial) { vm.switchUnits(true) }
            }
            VStack(alignment: .leading, spacing: Theme2.Space.s) {
                fieldLabel(vm.imperial ? "Height (ft / in)" : "Height (cm)")
                if vm.imperial {
                    HStack(spacing: Theme2.Space.m) {
                        input("feet", $vm.heightFt, .numberPad)
                        input("inches", $vm.heightIn, .numberPad)
                    }
                } else {
                    input("e.g. 175", $vm.heightCm, .decimalPad)
                }
            }
            VStack(alignment: .leading, spacing: Theme2.Space.s) {
                fieldLabel("Current weight (\(vm.imperial ? "lb" : "kg"))")
                input(vm.imperial ? "e.g. 176" : "e.g. 80", $vm.weight, .decimalPad)
            }
        }
    }

    private var activityStep: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.l) {
            header("How active are you?", "Be honest — most people pick one level too high, and an honest pick means a target you can trust. Being on your feet counts too.")
            VStack(spacing: Theme2.Space.s) {
                ForEach(ActivityLevel.allCases, id: \.self) { level in
                    ChoiceCard(title: level.label, blurb: level.blurb, selected: vm.activity == level) {
                        vm.activity = level
                    }
                }
            }
        }
    }

    private var goalStep: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.l) {
            header("What's your goal?", "Pick a direction and a pace you can live with — the gentler the pace, the easier it is to keep.")
            HStack(spacing: Theme2.Space.s) {
                ForEach([OnboardingViewModel.GoalKind.lose, .maintain, .gain], id: \.self) { kind in
                    ChoiceCard(title: kind.rawValue.capitalized, selected: vm.goalKind == kind) {
                        vm.goalKind = kind
                        vm.rate = nil
                    }
                }
            }
            if let goalKind = vm.goalKind, goalKind != .maintain {
                Text("How fast?").font(Theme2.Text.label).foregroundStyle(Theme2.inkSecondary)
                VStack(spacing: Theme2.Space.s) {
                    ForEach(vm.ratePresets()) { preset in
                        ChoiceCard(
                            title: preset.title,
                            blurb: preset.blurb,
                            badge: preset.recommended ? "Recommended" : nil,
                            selected: abs((vm.rate ?? -1) - preset.rateKg) < 0.0001
                        ) { vm.rate = preset.rateKg }
                    }
                }
            }
        }
    }

    private var permissionsStep: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.l) {
            header("A few quick asks", "All optional — everything works without them. Each yes just removes a step later, and Settings can flip any of these anytime.")
            VStack(spacing: Theme2.Space.s) {
                PermissionRow(
                    icon: "camera", title: "Camera",
                    blurb: "The front door — point it at plates, labels, and barcodes.",
                    deniedNote: "No problem — you can turn it on in Settings whenever.",
                    state: camState) { askCamera() }
                PermissionRow(
                    icon: "bell", title: "Bevi's Monday note",
                    blurb: "One notification a week: your verdict and the new target, Monday morning.",
                    deniedNote: "No problem — Settings can turn it on whenever.",
                    state: notifState) { askNotifications() }
                if HealthService.isAvailable {
                    PermissionRow(
                        icon: "heart", title: "Apple Health",
                        blurb: "I read new weigh-ins automatically, so the trend stays current.",
                        deniedNote: "No problem — connect it later from Settings.",
                        state: healthState) { askHealth() }
                }
            }
        }
    }

    private var resultStep: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.l) {
            header("Your starting plan is ready", "Here's what the formula says. Log your meals and weigh in when you can — in about two weeks, your scale takes over.")
            if let plan = vm.plan, let macros = vm.macros {
                HStack { Spacer(); Image("bevi-celebrate").resizable().scaledToFit().frame(height: 140).accessibilityHidden(true); Spacer() }
                PastelCard(tone: .lime) {
                    VStack(alignment: .leading, spacing: Theme2.Space.l) {
                        resultRow(
                            icon: "bolt.fill", filledCircle: false,
                            title: "Your body burns about", subtitle: "resting + daily activity",
                            value: "\(fmt(Int(vm.tdee.rounded()))) cal")
                        resultRow(
                            icon: "target", filledCircle: true,
                            title: "So you should eat", subtitle: eatSubtitle(),
                            value: "\(fmt(plan.intake)) cal")
                        macroSplit(plan: plan.intake, macros: macros)
                        Text("These numbers are my starting guess. Once there's about two weeks of real data, the Weight screen measures your actual burn and I'll tell you if this needs adjusting.")
                            .font(Theme2.Text.caption).foregroundStyle(Theme2.blockInkSecondary)
                    }
                }
            }
            if let error = vm.errorMessage {
                Text(error).font(Theme2.Text.caption).foregroundStyle(Theme2.statusOver)
            }
        }
    }

    private func eatSubtitle() -> String {
        guard vm.goalKind != .maintain else { return "to hold steady" }
        let deficit = abs(deficitForRate(vm.effectiveRate))
        let word = vm.effectiveRate < 0 ? "deficit" : "surplus"
        let dir = vm.goalKind?.rawValue ?? "lose"
        return "a \(fmt(deficit)) cal/day \(word) to \(dir) \(vm.displayRate(abs(vm.effectiveRate)))/week"
    }

    private func resultRow(icon: String, filledCircle: Bool, title: String, subtitle: String, value: String) -> some View {
        HStack(spacing: Theme2.Space.m) {
            ZStack {
                Circle().fill(filledCircle ? Theme2.blockInk : Color.black.opacity(0.1)).frame(width: 40, height: 40)
                Image(systemName: icon).font(.system(size: 18, weight: .bold))
                    .foregroundStyle(filledCircle ? Color.white : Theme2.blockInk)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 14, weight: .bold)).foregroundStyle(Theme2.blockInk)
                Text(subtitle).font(.system(size: 12)).foregroundStyle(Theme2.blockInkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: Theme2.Space.s)
            Text(value).font(.system(size: 22, weight: .black).monospacedDigit()).foregroundStyle(Theme2.blockInk)
        }
    }

    private func macroSplit(plan: Int, macros: MacroGrams) -> some View {
        let pcts = macroPercents(calories: plan, grams: macros)
        let cols: [(String, Int, Int)] = [
            ("Protein", pcts.proteinPct, macros.proteinG),
            ("Carbs", pcts.carbsPct, macros.carbsG),
            ("Fat", pcts.fatPct, macros.fatG),
        ]
        return HStack(spacing: Theme2.Space.s) {
            ForEach(cols, id: \.0) { name, pct, grams in
                VStack(spacing: 1) {
                    Text(name).font(.system(size: 12)).foregroundStyle(Theme2.blockInkSecondary)
                    Text("\(pct)%").font(.system(size: 15, weight: .bold).monospacedDigit()).foregroundStyle(Theme2.blockInk)
                    Text("\(grams)g").font(Theme2.Text.caption).foregroundStyle(Theme2.blockInkSecondary)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(Theme2.Space.m)
        .background(Color.black.opacity(0.1), in: RoundedRectangle(cornerRadius: Theme2.Radius.control, style: .continuous))
    }

    // MARK: - Permission asks (idle -> granted / denied, re-tap opens Settings)

    private func syncCameraState() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: camState = .granted
        case .denied, .restricted: camState = .denied
        default: camState = .idle
        }
    }
    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
    }
    private func askCamera() {
        switch camState {
        case .granted: return
        case .denied: openSettings()
        case .idle:
            AVCaptureDevice.requestAccess(for: .video) { ok in
                Task { @MainActor in camState = ok ? .granted : .denied }
            }
        }
    }
    private func askNotifications() {
        switch notifState {
        case .granted: return
        case .denied: openSettings()
        case .idle:
            Task { notifState = await NotificationService.requestAuthorization() ? .granted : .denied }
        }
    }
    private func askHealth() {
        guard healthState == .idle else { return }
        Task { healthState = await HealthService.requestAuthorization() ? .granted : .denied }
    }
}

/// idle → not yet asked, granted → allowed, denied → system said no (re-tap
/// points at Settings, per onboarding.tsx's PermissionRow).
private enum PermState { case idle, granted, denied }

/// Selectable bordered card (DESIGN.md §3 "Choice card"): title + optional
/// blurb and badge; selected flips to the primary fill. Ports RN ui.tsx's
/// ChoiceCard — nothing is pre-selected, so a nil answer stays nil until a tap
/// (the segmented-Picker default-selection trap this replaces couldn't).
private struct ChoiceCard: View {
    let title: String
    var blurb: String? = nil
    var badge: String? = nil
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                HStack(spacing: Theme2.Space.s) {
                    Text(title)
                        .font(.system(size: 16, weight: .black))
                        .foregroundStyle(selected ? Theme2.canvas : Theme2.ink)
                    if let badge {
                        Text(badge.uppercased())
                            .font(.system(size: 11, weight: .heavy))
                            .foregroundStyle(selected ? Theme2.ink : Theme2.inkSecondary)
                            .padding(.horizontal, Theme2.Space.s)
                            .padding(.vertical, 2)
                            .background(selected ? Theme2.canvas : Theme2.hairline, in: Capsule())
                    }
                }
                if let blurb {
                    Text(blurb)
                        .font(Theme2.Text.caption)
                        .foregroundStyle(selected ? Theme2.canvas.opacity(0.8) : Theme2.inkSecondary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Theme2.Space.m)
            .background(selected ? Theme2.ink : Theme2.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme2.Radius.control, style: .continuous)
                    .stroke(selected ? Color.clear : Theme2.hairline, lineWidth: 2))
            .clipShape(RoundedRectangle(cornerRadius: Theme2.Radius.control, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

/// One optional permission ask: icon, why-one-liner, and a live state. Granted
/// flips the card to the primary fill (like a selected ChoiceCard); a system
/// "no" swaps the blurb for a no-guilt pointer to Settings. Ports RN's PermissionRow.
private struct PermissionRow: View {
    let icon: String
    let title: String
    let blurb: String
    let deniedNote: String
    let state: PermState
    let action: () -> Void

    private var granted: Bool { state == .granted }

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme2.Space.m) {
                ZStack {
                    Circle().fill(granted ? Theme2.canvas : Theme2.hairline).frame(width: 40, height: 40)
                    Image(systemName: icon).font(.system(size: 18, weight: .medium)).foregroundStyle(Theme2.ink)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 16, weight: .black))
                        .foregroundStyle(granted ? Theme2.canvas : Theme2.ink)
                    Text(state == .denied ? deniedNote : blurb)
                        .font(Theme2.Text.caption)
                        .foregroundStyle(granted ? Theme2.canvas.opacity(0.8) : Theme2.inkSecondary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: Theme2.Space.s)
                Image(systemName: granted ? "checkmark" : "chevron.right")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(granted ? Theme2.canvas : Theme2.inkSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Theme2.Space.m)
            .background(granted ? Theme2.ink : Theme2.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme2.Radius.control, style: .continuous)
                    .stroke(granted ? Color.clear : Theme2.hairline, lineWidth: 2))
            .clipShape(RoundedRectangle(cornerRadius: Theme2.Radius.control, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(granted ? [.isSelected] : [])
    }
}
