import SwiftUI

/// The warm empty state (spec §2.1 "happy", §9.1). An empty day is the most
/// common first impression, so it gets real presence rather than an apology.
///
/// Uses SF Symbols rather than Bevi for now: Bevi's poses are PNG assets
/// tuned to the OLD pastel grounds, and re-tuning them for the warm canvas is
/// its own task. This is a deliberate, temporary substitution — the spec
/// keeps Bevi as an identity carrier.
struct EmptyStateView: View {
    let title: String
    let message: String
    var systemImage: String = "leaf"

    var body: some View {
        VStack(spacing: Theme2.Space.l) {
            Image(systemName: systemImage)
                .font(.system(size: 44, weight: .light))
                .foregroundStyle(Theme2.inkSecondary)
                .accessibilityHidden(true)
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
