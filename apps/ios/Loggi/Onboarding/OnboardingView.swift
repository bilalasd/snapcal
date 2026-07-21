import SwiftUI

/// First-run wizard. Ports onboarding.tsx: six steps that turn "who are you"
/// into a calorie and macro plan, then write goals + a first weigh-in.
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
    var saving = false
    var errorMessage: String?

    // Locale guess, overridable — the body step keeps a toggle for everyone
    // the guess misses (same reasoning as onboarding.tsx's localeImperial).
    var imperial: Bool = {
        let locale = Locale.current
        return !(locale.measurementSystem == .metric)
    }()

    var sex: Sex?
    var age = ""
    var heightCm = ""
    var heightFt = ""
    var heightIn = ""
    var weight = ""
    var activity: ActivityLevel?
    var goalKind: GoalKind?
    var rate: Double?

    private static let kgPerLb = 0.453592
    private static let cmPerIn = 2.54

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
    var ageValue: Int { Int(age) ?? 0 }

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

    func canContinue(_ step: Step) -> Bool {
        switch step {
        case .you: return sex != nil && ageValue >= 13 && ageValue <= 100
        case .body: return weightKg > 0 && resolvedHeightCm > 0
        case .activity: return activity != nil
        case .goal: return goalKind != nil
        case .permissions, .result: return true
        }
    }

    func next() {
        guard let idx = Step.allCases.firstIndex(of: step), idx + 1 < Step.allCases.count else { return }
        step = Step.allCases[idx + 1]
    }
    func back() {
        guard let idx = Step.allCases.firstIndex(of: step), idx > 0 else { return }
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
            adaptiveGoal: false)

        // The weigh-in is fire-and-forget: it's useful but not load-bearing,
        // and failing it must not cost the user their whole plan. Written as a
        // plain Task rather than `async let` with a cast — the latter tripped
        // a "failed to produce diagnostic" compiler crash (type-inference
        // blowup, same class as the one in MealLogger).
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
    @State private var vm = OnboardingViewModel()
    var onFinished: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            progressBar
            ScrollView {
                VStack(alignment: .leading, spacing: Theme2.Space.l) {
                    switch vm.step {
                    case .you: youStep
                    case .body: bodyStep
                    case .activity: activityStep
                    case .goal: goalStep
                    case .permissions: permissionsStep
                    case .result: resultStep
                    }
                }
                .padding(Theme2.Space.l)
            }
            footer
        }
        .background(Theme2.canvas)
    }

    private var progressBar: some View {
        let idx = OnboardingViewModel.Step.allCases.firstIndex(of: vm.step) ?? 0
        let fraction = Double(idx + 1) / Double(OnboardingViewModel.Step.allCases.count)
        return GeometryReader { geo in
            ZStack(alignment: .leading) {
                Rectangle().fill(Theme2.hairline)
                Rectangle().fill(Theme2.accentLog).frame(width: geo.size.width * fraction)
            }
        }
        .frame(height: 4)
        .accessibilityLabel("Step \(idx + 1) of \(OnboardingViewModel.Step.allCases.count)")
    }

    private func heading(_ kicker: String, _ title: String) -> some View {
        VStack(alignment: .leading, spacing: Theme2.Space.xs) {
            Text(kicker.uppercased()).font(Theme2.Text.kicker).foregroundStyle(Theme2.inkSecondary)
            Text(title).font(Theme2.Text.headline36).foregroundStyle(Theme2.ink)
        }
    }

    private var youStep: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.l) {
            heading("Step one", "About you")
            SurfaceCard {
                VStack(alignment: .leading, spacing: Theme2.Space.m) {
                    Text("Sex").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                    Picker("Sex", selection: Binding(
                        get: { vm.sex ?? .male },
                        set: { vm.sex = $0 })) {
                        Text("Male").tag(Sex.male)
                        Text("Female").tag(Sex.female)
                    }
                    .pickerStyle(.segmented)
                    Text("Used for the metabolic estimate — it's part of the standard formula.")
                        .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                    Divider().overlay(Theme2.hairline)
                    Text("Age").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                    TextField("30", text: $vm.age)
                        .keyboardType(.numberPad)
                        .font(Theme2.Text.label)
                }
            }
        }
    }

    private var bodyStep: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.l) {
            heading("Step two", "Height & weight")
            SurfaceCard {
                VStack(alignment: .leading, spacing: Theme2.Space.m) {
                    Picker("Units", selection: $vm.imperial) {
                        Text("Metric").tag(false)
                        Text("Imperial").tag(true)
                    }
                    .pickerStyle(.segmented)

                    Text("Height").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                    if vm.imperial {
                        HStack(spacing: Theme2.Space.m) {
                            TextField("ft", text: $vm.heightFt).keyboardType(.numberPad)
                            TextField("in", text: $vm.heightIn).keyboardType(.numberPad)
                        }
                        .font(Theme2.Text.label)
                    } else {
                        TextField("cm", text: $vm.heightCm)
                            .keyboardType(.decimalPad).font(Theme2.Text.label)
                    }

                    Divider().overlay(Theme2.hairline)
                    Text("Current weight").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                    TextField(vm.imperial ? "lb" : "kg", text: $vm.weight)
                        .keyboardType(.decimalPad).font(Theme2.Text.label)
                    Text("This becomes your first weigh-in, so your trend starts today.")
                        .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                }
            }
        }
    }

    private var activityStep: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.l) {
            heading("Step three", "How active are you?")
            ForEach(ActivityLevel.allCases, id: \.self) { level in
                Button {
                    vm.activity = level
                } label: {
                    SurfaceCard {
                        HStack {
                            VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                                Text(level.label).font(Theme2.Text.label).foregroundStyle(Theme2.ink)
                                Text(level.blurb).font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                                    .multilineTextAlignment(.leading)
                            }
                            Spacer(minLength: Theme2.Space.s)
                            if vm.activity == level {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme2.statusOnTarget)
                            }
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(vm.activity == level ? [.isSelected] : [])
            }
        }
    }

    private var goalStep: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.l) {
            heading("Step four", "What's the goal?")
            SurfaceCard {
                VStack(alignment: .leading, spacing: Theme2.Space.m) {
                    Picker("Goal", selection: Binding(
                        get: { vm.goalKind ?? .lose },
                        set: { vm.goalKind = $0 })) {
                        Text("Lose").tag(OnboardingViewModel.GoalKind.lose)
                        Text("Maintain").tag(OnboardingViewModel.GoalKind.maintain)
                        Text("Gain").tag(OnboardingViewModel.GoalKind.gain)
                    }
                    .pickerStyle(.segmented)

                    if vm.goalKind != .maintain {
                        Text("Rate (\(vm.imperial ? "lb" : "kg")/week)")
                            .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                        let presets: [Double] = vm.imperial ? [0.5, 1, 1.5, 2] : [0.25, 0.5, 0.75, 1]
                        HStack(spacing: Theme2.Space.s) {
                            ForEach(presets, id: \.self) { preset in
                                let kg = vm.imperial ? preset * 0.453592 : preset
                                Button {
                                    vm.rate = kg
                                } label: {
                                    Text(preset == preset.rounded() ? "\(Int(preset))" : String(format: "%.2g", preset))
                                        .font(Theme2.Text.label)
                                        .frame(maxWidth: .infinity, minHeight: 44)
                                }
                                .buttonStyle(.bordered)
                                .tint(abs((vm.rate ?? 0) - kg) < 0.001 ? Theme2.accentLog : Theme2.ink)
                            }
                        }
                    }
                }
            }
        }
    }

    /// Permissions are asked here but GRANTED later — the actual notification
    /// and HealthKit requests live in their own services. Onboarding just
    /// explains why, so the system prompt isn't a cold open.
    private var permissionsStep: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.l) {
            heading("Step five", "Two optional extras")
            SurfaceCard {
                VStack(alignment: .leading, spacing: Theme2.Space.m) {
                    Label("Monday note", systemImage: "bell")
                        .font(Theme2.Text.label).foregroundStyle(Theme2.ink)
                    Text("A weekly read on how the week actually went, every Monday morning.")
                        .font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary)
                    Button("Enable notifications") {
                        Task { _ = await NotificationService.requestAuthorization() }
                    }
                    .buttonStyle(.bordered).tint(Theme2.ink)
                }
            }
            SurfaceCard {
                VStack(alignment: .leading, spacing: Theme2.Space.m) {
                    Label("Apple Health", systemImage: "heart")
                        .font(Theme2.Text.label).foregroundStyle(Theme2.ink)
                    Text("Sync weigh-ins both ways, so stepping on a smart scale keeps your trend current.")
                        .font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary)
                    Button("Connect Health") {
                        Task { _ = await HealthService.requestAuthorization() }
                    }
                    .buttonStyle(.bordered).tint(Theme2.ink)
                }
            }
            Text("Both are optional and can be changed later in Settings.")
                .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
        }
    }

    private var resultStep: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.l) {
            heading("Your plan", "Here's the number")
            if let plan = vm.plan, let macros = vm.macros {
                PastelCard(tone: .lime) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("DAILY TARGET").font(Theme2.Text.kicker)
                            .foregroundStyle(Theme2.blockInkSecondary)
                        Text("\(plan.intake)")
                            .font(Theme2.Text.display60)
                            .minimumScaleFactor(0.5).lineLimit(1)
                        Text("cal a day").font(Theme2.Text.label)
                            .foregroundStyle(Theme2.blockInkSecondary)
                        Text("P \(macros.proteinG)g · C \(macros.carbsG)g · F \(macros.fatG)g")
                            .font(Theme2.Text.caption)
                            .foregroundStyle(Theme2.blockInkSecondary)
                            .padding(.top, Theme2.Space.s)
                    }
                }
                if plan.floored {
                    // Honesty over flattery: if the requested rate would take
                    // them below a safe floor, say so rather than quietly
                    // showing a number that doesn't match what they picked.
                    SurfaceCard {
                        HStack(alignment: .top, spacing: Theme2.Space.m) {
                            Image(systemName: "info.circle.fill").foregroundStyle(Theme2.statusOver)
                            Text("That rate would put you under a safe intake, so we've set the floor instead. A slower rate keeps more of your energy.")
                                .font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary)
                        }
                    }
                }
            }
            if let error = vm.errorMessage {
                Text(error).font(Theme2.Text.caption).foregroundStyle(Theme2.statusOver)
            }
        }
    }

    private var footer: some View {
        HStack(spacing: Theme2.Space.m) {
            if vm.step != .you {
                Button("Back") { vm.back() }
                    .buttonStyle(.bordered).tint(Theme2.ink)
                    .frame(minHeight: 50)
            }
            Button {
                if vm.step == .result {
                    Task { if await vm.finish() { onFinished() } }
                } else {
                    vm.next()
                }
            } label: {
                HStack {
                    if vm.saving { ProgressView().tint(.white) }
                    Text(vm.step == .result ? "Start logging" : "Continue")
                        .font(Theme2.Text.label)
                }
                .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme2.accentLog)
            .disabled(!vm.canContinue(vm.step) || vm.saving)
        }
        .padding(Theme2.Space.l)
        .background(Theme2.surface)
    }
}
