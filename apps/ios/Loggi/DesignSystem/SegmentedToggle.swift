import SwiftUI

/// Primary-fill segmented control (DESIGN.md §3 "SegmentedToggle"): a pill
/// track with the selected segment filled in primary ink and an on-primary
/// label. Replaces the native `.segmented` picker, whose light thumb washes
/// out (especially on a pastel card) and doesn't match the spec.
///
/// Generic over the selected value; pass `onPastel` when it sits on a
/// theme-fixed pastel surface so it uses fixed ink instead of themed tokens.
struct SegmentedToggle<Value: Hashable>: View {
    let options: [(label: String, value: Value)]
    @Binding var selection: Value
    var onPastel = false

    private func fg(_ selected: Bool) -> Color {
        onPastel ? (selected ? .white : .black) : (selected ? Theme2.canvas : Theme2.ink)
    }
    private var trackBg: Color { onPastel ? Color.black.opacity(0.08) : Theme2.hairline }
    private var selectedBg: Color { onPastel ? .black : Theme2.ink }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.value) { option in
                let selected = option.value == selection
                Text(option.label)
                    .font(Theme2.Text.label)
                    .foregroundStyle(fg(selected))
                    .frame(maxWidth: .infinity, minHeight: 34)
                    .background(selected ? selectedBg : Color.clear, in: Capsule())
                    .contentShape(Capsule())
                    .onTapGesture { selection = option.value }
                    .accessibilityAddTraits(selected ? [.isSelected] : [])
            }
        }
        .padding(3)
        .background(trackBg, in: Capsule())
    }
}
