import SwiftUI
import PhotosUI

/// The camera path: shoot a meal (or a label, or a barcode), analyze it, hand
/// the draft to review. Ports add.tsx's camera mode.
///
/// Three ways out, all converging on the same draft:
///  - shutter or library → `/api/analyze` with the image
///  - barcode in frame → Open Food Facts, straight to a one-item draft
///  - "describe instead" → the text path, so a failed scan never dead-ends
@MainActor
@Observable
final class CaptureViewModel {
    var analyzing = false
    var lookupBusy = false
    var notice: String?
    var errorMessage: String?
    var draft: MealDraft?
    var pendingPhoto: Data?
    /// The just-shot frame, held so the view can freeze it on screen while
    /// analysis runs — confirmation that the picture was actually taken
    /// (DESIGN.md §Analyzing overlay: "photo … ticking status"). Cleared on
    /// error so the live camera returns for a retake.
    var capturedImage: UIImage?

    private struct AnalyzeRequest: Encodable {
        let images: [AnalyzeImage]
        let text: String?
    }
    private struct AnalyzeResponse: Decodable {
        let mealName: String
        let items: [DraftItem]
        enum CodingKeys: String, CodingKey { case mealName = "meal_name", items }
    }

    /// Analyze a captured image. The photo is uploaded in parallel so the meal
    /// keeps its picture — but an upload failure must NOT block logging, so it
    /// degrades to a photo-less draft rather than erroring out.
    func analyze(_ image: UIImage, note: String? = nil) async {
        // Freeze the shot immediately so the user sees what they captured while
        // it's being analyzed, not a black scrim.
        capturedImage = image
        guard let jpeg = PhotoPipeline.prepare(image) else {
            capturedImage = nil
            errorMessage = "Couldn't read that photo — try again."
            return
        }
        pendingPhoto = jpeg
        analyzing = true
        errorMessage = nil
        defer { analyzing = false }

        async let uploaded = try? await PhotoPipeline.upload(jpeg)
        do {
            let response: AnalyzeResponse = try await APIClient.shared.post(
                "/api/analyze",
                body: AnalyzeRequest(images: PhotoPipeline.analyzePayload([jpeg]), text: note))
            let photo = await uploaded
            draft = MealDraft(name: response.mealName, eatenAt: "", note: note,
                              source: "photo", items: response.items,
                              photos: photo.map { [$0] } ?? [])
        } catch {
            _ = await uploaded // don't leave the upload task dangling
            capturedImage = nil // back to the live camera so they can retake
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "Couldn't analyze this photo — try a clearer shot or describe it instead."
        }
    }

    /// A barcode needs no analysis — Open Food Facts returns a finished item.
    func handleBarcode(_ code: String) async {
        guard !lookupBusy else { return }
        lookupBusy = true
        notice = nil
        defer { lookupBusy = false }
        if let item = await BarcodeLookup.lookup(code) {
            draft = MealDraft(name: item.name, eatenAt: "", note: nil,
                              source: "text", items: [item], photos: [])
        } else {
            // Keep the camera open — RN's exact behaviour. A miss is a nudge,
            // not a dead end.
            notice = "That barcode isn't in the food database — snap the food or its label instead."
        }
    }
}

struct CaptureView: View {
    @State private var vm = CaptureViewModel()
    @State private var camera = CameraModel()
    @State private var pickerItem: PhotosPickerItem?
    @State private var shutterFlash: Double = 0
    @Environment(\.dismiss) private var dismiss
    var targetDate: Date = Date()

    var body: some View {
        NavigationStack {
            ZStack {
                if let shot = vm.capturedImage {
                    // Freeze-frame of the shot while it's analyzed — the user
                    // sees exactly what was captured.
                    Image(uiImage: shot)
                        .resizable()
                        .scaledToFill()
                        .ignoresSafeArea()
                } else if camera.unavailable {
                    unavailableState
                } else {
                    CameraPreview(session: camera.session)
                        .ignoresSafeArea()
                }
                controls
                if vm.analyzing || vm.lookupBusy { analyzingOverlay }
                // Shutter flash — a quick white blink confirms the capture.
                Color.white
                    .ignoresSafeArea()
                    .opacity(shutterFlash)
                    .allowsHitTesting(false)
            }
            .background(Color.black)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.tint(.white)
                }
                ToolbarItem(placement: .primaryAction) {
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        Image(systemName: "photo.on.rectangle")
                    }
                    .tint(.white)
                }
            }
            .task { await camera.start() }
            .onDisappear { camera.stop() }
            .onChange(of: camera.captured) { _, image in
                guard let image else { return }
                camera.captured = nil
                Task { await vm.analyze(image) }
            }
            .onChange(of: camera.barcode) { _, code in
                guard let code else { return }
                Task { await vm.handleBarcode(code) }
            }
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let image = UIImage(data: data) {
                        await vm.analyze(image)
                    }
                    pickerItem = nil
                }
            }
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

    private struct DraftBox: Identifiable {
        let id = UUID()
        let draft: MealDraft
    }

    /// Shutter shrinks on press for a tactile "click," then springs back.
    private struct ShutterButtonStyle: ButtonStyle {
        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .scaleEffect(configuration.isPressed ? 0.88 : 1)
                .animation(.spring(response: 0.2, dampingFraction: 0.6), value: configuration.isPressed)
        }
    }

    private var unavailableState: some View {
        VStack(spacing: Theme2.Space.l) {
            Image(systemName: "camera.fill")
                .font(.system(size: 44))
                .foregroundStyle(.white.opacity(0.6))
            Text(camera.permission == .denied ? "Camera access is off" : "No camera here")
                .font(Theme2.Text.title).foregroundStyle(.white)
            Text(camera.permission == .denied
                 ? "Enable camera access in Settings to snap meals."
                 : "The simulator has no camera. Use the photo library, or describe the meal instead.")
                .font(Theme2.Text.body)
                .foregroundStyle(.white.opacity(0.7))
                .multilineTextAlignment(.center)
        }
        .padding(Theme2.Space.xl)
    }

    private var controls: some View {
        VStack {
            Spacer()
            if let notice = vm.notice {
                Text(notice)
                    .font(Theme2.Text.caption)
                    .foregroundStyle(.white)
                    .padding(Theme2.Space.m)
                    .background(.black.opacity(0.6), in: RoundedRectangle(cornerRadius: Theme2.Radius.control))
                    .padding(.horizontal, Theme2.Space.l)
            }
            if let error = vm.errorMessage {
                Text(error)
                    .font(Theme2.Text.caption)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(Theme2.Space.m)
                    .background(Theme2.statusOver.opacity(0.85), in: RoundedRectangle(cornerRadius: Theme2.Radius.control))
                    .padding(.horizontal, Theme2.Space.l)
            }
            Button {
                triggerShutter()
                camera.capture()
            } label: {
                // Standard iOS still-photo shutter: white ring + white inner
                // disc. A red fill reads as "record video" (the user's note),
                // so the accent stays out of this control.
                ZStack {
                    Circle().stroke(.white, lineWidth: 4).frame(width: 76, height: 76)
                    Circle().fill(.white).frame(width: 62, height: 62)
                }
            }
            .buttonStyle(ShutterButtonStyle())
            .padding(.bottom, Theme2.Space.xl)
            .disabled(camera.unavailable || vm.analyzing)
            .accessibilityLabel("Take a photo")
        }
    }

    /// White blink + capture haptic — makes it unmistakable the shot fired.
    private func triggerShutter() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        shutterFlash = 0.85
        // Commit the white frame, then fade it out next runloop so the blink
        // is visible (an in-place set-then-animate would render only the end).
        DispatchQueue.main.async {
            withAnimation(.easeOut(duration: 0.35)) { shutterFlash = 0 }
        }
    }

    private var analyzingOverlay: some View {
        ZStack {
            // Lighter than a full scrim so the frozen photo behind it still
            // reads while the spinner + status sit on top.
            Color.black.opacity(0.45).ignoresSafeArea()
            VStack(spacing: Theme2.Space.m) {
                ProgressView().tint(.white).scaleEffect(1.4)
                Text(vm.lookupBusy ? "Looking that up…" : "Working out what's on the plate…")
                    .font(Theme2.Text.label).foregroundStyle(.white)
            }
        }
        .accessibilityLabel(vm.lookupBusy ? "Looking up barcode" : "Analyzing photo")
    }
}
