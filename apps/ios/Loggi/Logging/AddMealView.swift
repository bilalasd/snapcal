import SwiftUI

/// The logging entry point. Ports the text-driven half of add.tsx: describe a
/// meal, or re-log something from recents/favourites. Camera, barcode and
/// speech are the second pass — they need a physical device to verify, so
/// this pass deliberately covers only what can be checked here.
///
/// `.search` and `.saved` are two tabs over the same list machinery, exactly
/// as add.tsx models them.
@MainActor
@Observable
final class AddMealViewModel {
    enum Mode: String, CaseIterable, Identifiable {
        case camera = "Camera"
        case describe = "Describe"
        case speak = "Speak"
        case saved = "Saved"
        var id: String { rawValue }
    }

    var mode: Mode = .camera
    var query = ""
    var recents: [ApiMeal] = []
    var favorites: [ApiMeal] = []
    var analyzing = false
    var errorMessage: String?
    /// Set when analysis returns — drives the review sheet.
    var draft: MealDraft?

    private var searchTask: Task<Void, Never>?

    func loadLists() async {
        async let fav: [ApiMeal]? = try? APIClient.shared.get("/api/meals", query: ["favorites": "true"])
        async let rec: [ApiMeal]? = try? APIClient.shared.get("/api/meals", query: ["recent": "true"])
        let (f, r) = await (fav, rec)
        if let f { favorites = f }
        if let r { recents = r }
    }

    /// 250ms debounce, matching add.tsx's search effect — without it every
    /// keystroke fires a request.
    func searchChanged() {
        searchTask?.cancel()
        let q = query.trimmingCharacters(in: .whitespaces)
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            var params = ["recent": "true"]
            if !q.isEmpty { params["q"] = q }
            if let r: [ApiMeal] = try? await APIClient.shared.get("/api/meals", query: params) {
                recents = r
            }
        }
    }

    private struct AnalyzeRequest: Encodable { let text: String }
    private struct AnalyzeResponse: Decodable {
        let mealName: String
        let items: [DraftItem]
        enum CodingKeys: String, CodingKey {
            case mealName = "meal_name"
            case items
        }
    }

    /// Text-only analysis — principle 6's fallback ("describe it if you can't
    /// photograph it"). Same endpoint the camera path uses, with no images, so
    /// the draft lands as source "text".
    func describe() async {
        let text = query.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        analyzing = true
        errorMessage = nil
        defer { analyzing = false }
        do {
            let response: AnalyzeResponse = try await APIClient.shared.post(
                "/api/analyze", body: AnalyzeRequest(text: text))
            draft = MealDraft(name: response.mealName, eatenAt: "", note: nil,
                              source: "text", items: response.items, photos: [])
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Couldn't analyze that — try again."
        }
    }
}

struct AddMealView: View {
    @State private var vm: AddMealViewModel
    @State private var dictation = DictationService()
    @State private var cameraOpen = false
    @Environment(\.dismiss) private var dismiss
    /// The day being logged to — Today passes its paged date so a meal added
    /// while viewing yesterday lands on yesterday, matching add.tsx's `date`
    /// search param.
    let targetDate: Date

    /// `initialMode` lets the speed-dial fan open straight to Camera / Describe
    /// / Speak / Saved. Seeded into the view model here so there's no flash of
    /// the default (camera) tab before switching.
    init(targetDate: Date = Date(), initialMode: AddMealViewModel.Mode? = nil) {
        self.targetDate = targetDate
        let model = AddMealViewModel()
        if let initialMode { model.mode = initialMode }
        _vm = State(initialValue: model)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // No segmented chooser — the speed dial already picked the mode
                // and takes you straight here (DESIGN §4.4 "no chooser screen").
                switch vm.mode {
                case .camera: cameraTab
                case .describe: describeTab
                case .speak: speakTab
                case .saved: savedTab
                }
            }
            .background(Theme2.canvas)
            .navigationTitle(vm.mode.rawValue)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task { await vm.loadLists() }
            .sheet(item: Binding(
                get: { vm.draft.map { DraftBox(draft: $0) } },
                set: { vm.draft = $0?.draft })) { box in
                MealReviewView(draft: box.draft, targetDate: targetDate) {
                    vm.draft = nil
                    dismiss()
                }
            }
        }
    }

    /// `MealDraft` isn't Identifiable (it's a wire model), so `.sheet(item:)`
    /// needs a wrapper rather than making the model conform for a UI reason.
    private struct DraftBox: Identifiable {
        let id = UUID()
        let draft: MealDraft
    }

    /// Camera is a full-screen presentation rather than an inline tab: a
    /// viewfinder inside a segmented-control layout reads as a toy, and the
    /// capture flow needs the whole screen.
    private var cameraTab: some View {
        VStack(spacing: Theme2.Space.l) {
            Spacer()
            EmptyStateView(
                title: "Snap your meal",
                message: "Point the camera at your plate — or at a barcode — and Loggi works out the rest.",
                bevi: "bevi-camera")
            Button {
                cameraOpen = true
            } label: {
                Label("Open camera", systemImage: "camera.fill")
                    .font(Theme2.Text.label)
                    .foregroundStyle(Theme2.blockInk)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(Theme2.accentLog, in: Capsule())
            }
            Spacer()
        }
        .padding(Theme2.Space.l)
        .fullScreenCover(isPresented: $cameraOpen) {
            CaptureView(targetDate: targetDate)
                .onDisappear { dismiss() }
        }
    }

    private var describeTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme2.Space.l) {
                SurfaceCard {
                    VStack(alignment: .leading, spacing: Theme2.Space.m) {
                        Text("What did you eat?")
                            .font(Theme2.Text.label).foregroundStyle(Theme2.ink)
                        TextField("e.g. two eggs on toast with butter", text: $vm.query, axis: .vertical)
                            .font(Theme2.Text.body)
                            .lineLimit(2...4)
                            .textFieldStyle(.plain)
                            .padding(Theme2.Space.m)
                            .background(Theme2.canvas, in: RoundedRectangle(cornerRadius: Theme2.Radius.control))
                            .onSubmit { Task { await vm.describe() } }
                        Button {
                            Task { await vm.describe() }
                        } label: {
                            HStack {
                                if vm.analyzing { ProgressView().tint(Theme2.blockInk) }
                                Text(vm.analyzing ? "Analyzing…" : "Analyze")
                                    .font(Theme2.Text.label)
                            }
                            .foregroundStyle(Theme2.blockInk)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(Theme2.accentLog, in: Capsule())
                        }
                        .disabled(vm.query.trimmingCharacters(in: .whitespaces).isEmpty || vm.analyzing)
                        if let err = vm.errorMessage {
                            Text(err).font(Theme2.Text.caption).foregroundStyle(Theme2.statusOver)
                        }
                    }
                }

                if !vm.recents.isEmpty {
                    Text("RECENT").font(Theme2.Text.kicker).foregroundStyle(Theme2.inkSecondary)
                    ForEach(vm.recents) { meal in mealRow(meal) }
                }
            }
            .padding(Theme2.Space.l)
        }
        .onChange(of: vm.query) { _, _ in vm.searchChanged() }
    }

    /// Speak — live on-device dictation (DictationService) into the same
    /// analyze pipeline as Describe. Device-only at runtime (the sim has no
    /// mic feed / speech model); it no-ops gracefully otherwise.
    private var speakTab: some View {
        VStack(spacing: Theme2.Space.l) {
            Spacer()
            EmptyStateView(
                title: dictation.isListening ? "Listening…" : "Say what you ate",
                message: dictation.isListening
                    ? "Describe your meal out loud, then tap Done."
                    : "Tap the mic and describe your meal — Loggi transcribes it and works out the rest.",
                bevi: "bevi-standing")
            if !dictation.transcript.isEmpty {
                Text(dictation.transcript)
                    .font(Theme2.Text.body).foregroundStyle(Theme2.ink)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(Theme2.Space.l)
                    .background(Theme2.hairline, in: RoundedRectangle(cornerRadius: Theme2.Radius.control))
            }
            Button {
                Task {
                    if dictation.isListening {
                        let text = await dictation.stop()
                        if !text.isEmpty { vm.query = text; await vm.describe() }
                    } else if await dictation.requestPermission() {
                        await dictation.start()
                    }
                }
            } label: {
                HStack {
                    if vm.analyzing { ProgressView().tint(Theme2.blockInk) }
                    Label(
                        vm.analyzing ? "Analyzing…" : (dictation.isListening ? "Done — analyze" : "Start speaking"),
                        systemImage: dictation.isListening ? "checkmark" : "mic.fill")
                        .font(Theme2.Text.label)
                }
                .foregroundStyle(Theme2.blockInk)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Theme2.accentLog, in: Capsule())
            }
            .disabled(vm.analyzing)
            if let err = dictation.errorMessage ?? vm.errorMessage {
                Text(err).font(Theme2.Text.caption).foregroundStyle(Theme2.statusOver)
            }
            Spacer()
        }
        .padding(Theme2.Space.l)
        .animation(Theme2.Motion.standard, value: dictation.isListening)
    }

    private var savedTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme2.Space.m) {
                if vm.favorites.isEmpty {
                    SurfaceCard {
                        EmptyStateView(
                            title: "Nothing saved yet",
                            message: "Star a meal from your journal and it'll show up here for one-tap logging.",
                            bevi: "bevi-clipboard")
                    }
                } else {
                    ForEach(vm.favorites) { meal in mealRow(meal) }
                }
            }
            .padding(Theme2.Space.l)
        }
    }

    /// One-tap re-log. No review step — that's the point of `quickLog`.
    private func mealRow(_ meal: ApiMeal) -> some View {
        Button {
            MealLogger.quickLog(meal, on: targetDate)
            dismiss()
        } label: {
            SurfaceCard {
                HStack {
                    VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                        Text(meal.name)
                            .font(Theme2.Text.label).foregroundStyle(Theme2.ink)
                            .multilineTextAlignment(.leading)
                        Text("\(Int(mealTotals(meal).calories)) cal")
                            .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                            .monospacedDigit()
                    }
                    Spacer(minLength: Theme2.Space.s)
                    Image(systemName: "plus.circle.fill")
                        .font(Theme2.Text.title)
                        .foregroundStyle(Theme2.accentLog)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Log \(meal.name), \(Int(mealTotals(meal).calories)) calories")
    }
}
