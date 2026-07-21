import SwiftUI
import PhotosUI

/// Menu Scout — photograph a restaurant menu, get each dish rated against
/// what's left in today's budget. Ports menu-scout.tsx.
///
/// The fit rating is the whole feature: "fits / tight / over" answers the
/// actual question at a restaurant table, which is not "how many calories is
/// this" but "can I have it".
@MainActor
@Observable
final class MenuScoutViewModel {
    enum Fit: String, Codable {
        case fits, tight, over

        var label: String {
            switch self {
            case .fits: "Fits"
            case .tight: "Tight"
            case .over: "Over"
            }
        }
        /// Colour is paired with the word everywhere this renders — fits/over
        /// are the same green/red pair that collapses under CVD.
        var color: Color {
            switch self {
            case .fits: Theme2.statusOnTarget
            case .tight: Theme2.inkSecondary
            case .over: Theme2.statusOver
            }
        }
        var symbol: String {
            switch self {
            case .fits: "checkmark.circle.fill"
            case .tight: "equal.circle.fill"
            case .over: "exclamationmark.triangle.fill"
            }
        }
    }

    struct Dish: Codable, Identifiable {
        var id: String { name }
        let name: String
        let portionNote: String
        let calories: Double
        let proteinG: Double
        let carbsG: Double
        let fatG: Double
        let fit: Fit

        enum CodingKeys: String, CodingKey {
            case name
            case portionNote = "portion_note"
            case calories
            case proteinG = "protein_g"
            case carbsG = "carbs_g"
            case fatG = "fat_g"
            case fit
        }
    }

    private struct MenuResponse: Decodable {
        let isMenu: Bool
        let remainingKcal: Double
        let dishes: [Dish]
        enum CodingKeys: String, CodingKey {
            case isMenu = "is_menu"
            case remainingKcal = "remaining_kcal"
            case dishes
        }
    }
    private struct MenuBody: Encodable {
        let images: [AnalyzeImage]
        let tz_offset: Int
    }

    var scanning = false
    var dishes: [Dish] = []
    var remaining: Double?
    var notMenu = false
    var errorMessage: String?

    func scan(_ image: UIImage) async {
        guard let jpeg = PhotoPipeline.prepare(image) else {
            errorMessage = "Couldn't read that photo."
            return
        }
        scanning = true
        errorMessage = nil
        notMenu = false
        defer { scanning = false }
        do {
            let response: MenuResponse = try await APIClient.shared.post(
                "/api/menu",
                body: MenuBody(images: PhotoPipeline.analyzePayload([jpeg]),
                               tz_offset: tzOffsetMinutes()))
            notMenu = !response.isMenu
            remaining = response.remainingKcal
            dishes = response.dishes
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "Couldn't read that menu — try a straighter shot."
        }
    }

    /// Tapping a dish reserves it as a PLANNED meal: it comes off the budget
    /// now, before it's eaten, which is the point of scouting a menu.
    func reserve(_ dish: Dish) {
        MealLogger.log(
            name: dish.name,
            items: [DraftItem(name: dish.name, portion: dish.portionNote,
                              calories: dish.calories, proteinG: dish.proteinG,
                              carbsG: dish.carbsG, fatG: dish.fatG)],
            source: "text",
            planned: true)
    }
}

struct MenuScoutView: View {
    @State private var vm = MenuScoutViewModel()
    @State private var pickerItem: PhotosPickerItem?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme2.Space.l) {
                    if vm.dishes.isEmpty && !vm.scanning {
                        SurfaceCard {
                            EmptyStateView(
                                title: vm.notMenu ? "That doesn't look like a menu" : "Point it at the menu",
                                message: vm.notMenu
                                    ? "Try again with the menu filling the frame."
                                    : "Snap the menu and I'll tell you which dishes fit what's left today.",
                                bevi: "bevi-clipboard")
                        }
                        PhotosPicker(selection: $pickerItem, matching: .images) {
                            Label("Choose a photo", systemImage: "photo")
                                .font(Theme2.Text.label)
                                .frame(maxWidth: .infinity, minHeight: 50)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Theme2.accentLog)
                    }

                    if vm.scanning {
                        HStack(spacing: Theme2.Space.m) {
                            ProgressView()
                            Text("Reading the menu…")
                                .font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary)
                        }
                    }

                    if let remaining = vm.remaining, !vm.dishes.isEmpty {
                        PastelCard(tone: .cream) {
                            VStack(alignment: .leading, spacing: 0) {
                                Text("LEFT TODAY").font(Theme2.Text.kicker)
                                    .foregroundStyle(Theme2.blockInkSecondary)
                                Text("\(Int(remaining))")
                                    .font(Theme2.Text.display60)
                                    .minimumScaleFactor(0.5).lineLimit(1)
                                Text("cal").font(Theme2.Text.label)
                                    .foregroundStyle(Theme2.blockInkSecondary)
                            }
                        }
                    }

                    if let error = vm.errorMessage {
                        Text(error).font(Theme2.Text.caption).foregroundStyle(Theme2.statusOver)
                    }

                    ForEach(vm.dishes) { dish in dishCard(dish) }
                }
                .padding(Theme2.Space.l)
            }
            .background(Theme2.canvas)
            .navigationTitle("Menu scout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let image = UIImage(data: data) {
                        await vm.scan(image)
                    }
                    pickerItem = nil
                }
            }
        }
    }

    private func dishCard(_ dish: MenuScoutViewModel.Dish) -> some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: Theme2.Space.s) {
                HStack {
                    Text(dish.name).font(Theme2.Text.label).foregroundStyle(Theme2.ink)
                    Spacer(minLength: Theme2.Space.s)
                    Label(dish.fit.label, systemImage: dish.fit.symbol)
                        .font(Theme2.Text.caption)
                        .foregroundStyle(dish.fit.color)
                }
                Text(dish.portionNote)
                    .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                Text("\(Int(dish.calories)) cal · P \(Int(dish.proteinG))g · C \(Int(dish.carbsG))g · F \(Int(dish.fatG))g")
                    .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                    .monospacedDigit()
                Button {
                    vm.reserve(dish)
                    dismiss()
                } label: {
                    Text("Reserve it")
                        .font(Theme2.Text.label)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .tint(Theme2.ink)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("\(dish.name), \(Int(dish.calories)) calories, \(dish.fit.label)")
        }
    }
}
