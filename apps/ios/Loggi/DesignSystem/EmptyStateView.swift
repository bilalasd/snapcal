import SwiftUI

/// The warm empty state (spec §2.1 "happy", §9.1). An empty day is the most
/// common first impression, so it gets real presence rather than an apology.
///
/// Bevi appears here. The empty state is the screen that most needs warmth,
/// and Bevi is one of the two identity carriers — an SF Symbol in this slot
/// was the single biggest personality loss in the first pass. Poses live in
/// the asset catalog from Phase 0 (bevi-camera/wave/celebrate/...).
struct EmptyStateView: View {
    let title: String
    let message: String
    /// Bevi pose asset name, e.g. "bevi-camera". Falls back to `systemImage`
    /// when nil so non-Bevi empty states (errors, filtered lists) stay simple.
    var bevi: String?
    var systemImage: String = "leaf"

    var body: some View {
        VStack(spacing: Theme2.Space.l) {
            if let bevi {
                Image(bevi)
                    .resizable()
                    .scaledToFit()
                    .frame(height: 132)
                    .accessibilityHidden(true)
            } else {
                Image(systemName: systemImage)
                    .font(.system(size: 44, weight: .light))
                    .foregroundStyle(Theme2.inkSecondary)
                    .accessibilityHidden(true)
            }
            VStack(spacing: Theme2.Space.s) {
                Text(title)
                    .font(Theme2.Text.title)
                    .foregroundStyle(Theme2.ink)
                    .multilineTextAlignment(.center)
                Text(message)
                    .font(Theme2.Text.body)
                    .foregroundStyle(Theme2.inkSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, Theme2.Space.xl)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}
