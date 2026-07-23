import SwiftUI

/// Review-and-save. Ports add.tsx's review step: the analyzed draft is fully
/// editable before it's committed, because the model guesses and the user is
/// the authority. Saving is optimistic (see `MealLogger`), so this dismisses
/// immediately rather than blocking on the network.
struct MealReviewView: View {
    @State private var name: String
    @State private var items: [DraftItem]
    @State private var planned: Bool
    @State private var eatenTime: Date
    @Environment(\.dismiss) private var dismiss

    private let source: String
    private let photos: [DraftPhoto]
    private let targetDate: Date
    private let onSaved: () -> Void

    init(draft: MealDraft, targetDate: Date, onSaved: @escaping () -> Void) {
        _name = State(initialValue: draft.name)
        _items = State(initialValue: draft.items)
        _planned = State(initialValue: false)
        // Default to now for today, or midday for a past date — a meal logged
        // to "yesterday" with the current clock time would read oddly.
        let cal = Calendar.current
        let isToday = cal.isDateInToday(targetDate)
        _eatenTime = State(initialValue: isToday ? Date()
                           : (cal.date(bySettingHour: 12, minute: 0, second: 0, of: targetDate) ?? targetDate))
        self.source = draft.source
        self.photos = draft.photos ?? []
        self.targetDate = targetDate
        self.onSaved = onSaved
    }

    private var totals: (calories: Double, protein: Double, carbs: Double, fat: Double) {
        items.reduce((0.0, 0.0, 0.0, 0.0)) { acc, item in
            (acc.0 + item.calories, acc.1 + item.proteinG, acc.2 + item.carbsG, acc.3 + item.fatG)
        }
    }

    private var canSave: Bool {
        items.contains { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme2.Space.l) {
                    PastelCard(tone: .lime) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("THIS MEAL")
                                .font(Theme2.Text.kicker).foregroundStyle(Theme2.blockInkSecondary)
                            Text("\(Int(totals.calories))")
                                .font(Theme2.Text.display60)
                                .minimumScaleFactor(0.5).lineLimit(1)
                            Text("cal")
                                .font(Theme2.Text.label).foregroundStyle(Theme2.blockInkSecondary)
                            Text("P \(Int(totals.protein))g · C \(Int(totals.carbs))g · F \(Int(totals.fat))g")
                                .font(Theme2.Text.caption)
                                .foregroundStyle(Theme2.blockInkSecondary)
                                .padding(.top, Theme2.Space.s)
                        }
                    }

                    SurfaceCard {
                        VStack(alignment: .leading, spacing: Theme2.Space.m) {
                            Text("Meal name").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                            TextField("Meal", text: $name)
                                .font(Theme2.Text.label)
                                .textFieldStyle(.plain)
                            Divider().overlay(Theme2.hairline)
                            DatePicker("Eaten at", selection: $eatenTime, displayedComponents: .hourAndMinute)
                                .font(Theme2.Text.body)
                            Toggle("Planned (reserve, don't count yet)", isOn: $planned)
                                .font(Theme2.Text.body)
                                .tint(Theme2.ink)
                        }
                    }

                    Text("ITEMS").font(Theme2.Text.kicker).foregroundStyle(Theme2.inkSecondary)
                    ForEach($items) { $item in
                        itemCard($item)
                    }

                    Button {
                        items.append(DraftItem(name: "", portion: "", calories: 0,
                                               proteinG: 0, carbsG: 0, fatG: 0))
                    } label: {
                        Label("Add an item", systemImage: "plus")
                            .font(Theme2.Text.label)
                            .foregroundStyle(Theme2.ink)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(Theme2.hairline, in: Capsule())
                    }
                }
                .padding(Theme2.Space.l)
                .padding(.bottom, 96)
            }
            .background(Theme2.canvas)
            .navigationTitle("Review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .font(Theme2.Text.label)
                        .disabled(!canSave)
                }
            }
        }
    }

    private func itemCard(_ item: Binding<DraftItem>) -> some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: Theme2.Space.s) {
                HStack {
                    TextField("Item name", text: item.name)
                        .font(Theme2.Text.label)
                        .textFieldStyle(.plain)
                    Button {
                        items.removeAll { $0.id == item.wrappedValue.id }
                    } label: {
                        Image(systemName: "trash")
                            .foregroundStyle(Theme2.statusOver)
                    }
                    .accessibilityLabel("Remove \(item.wrappedValue.name)")
                }
                TextField("Portion", text: item.portion)
                    .font(Theme2.Text.caption)
                    .foregroundStyle(Theme2.inkSecondary)
                    .textFieldStyle(.plain)
                HStack(spacing: Theme2.Space.m) {
                    numberField("cal", value: item.calories)
                    numberField("P", value: item.proteinG)
                    numberField("C", value: item.carbsG)
                    numberField("F", value: item.fatG)
                }
            }
        }
    }

    /// Numbers come back from the model as guesses; these are the correction
    /// surface, so they're plain editable fields rather than read-only text.
    private func numberField(_ label: String, value: Binding<Double>) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
            TextField("0", value: value, format: .number)
                .font(Theme2.Text.body)
                .monospacedDigit()
                .keyboardType(.decimalPad)
                .textFieldStyle(.plain)
                .padding(Theme2.Space.s)
                .background(Theme2.canvas, in: RoundedRectangle(cornerRadius: Theme2.Radius.control))
        }
    }

    private func save() {
        // Combine the target DAY with the chosen TIME — the picker only edits
        // hour/minute, so using it wholesale would move the meal to today.
        let cal = Calendar.current
        let time = cal.dateComponents([.hour, .minute], from: eatenTime)
        let eatenAt = cal.date(bySettingHour: time.hour ?? 12, minute: time.minute ?? 0,
                               second: 0, of: targetDate) ?? targetDate
        MealLogger.log(name: name, items: items, source: source,
                       planned: planned, photos: photos, eatenAt: eatenAt)
        onSaved()
    }
}
