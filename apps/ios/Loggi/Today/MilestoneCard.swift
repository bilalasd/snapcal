import SwiftUI

/// A generic milestone display card — shape only. RN's
/// apps/mobile/components/milestone-card.tsx detects specific milestone
/// types (streak/verdict/weigh-in) via lib/milestones.ts and offers a
/// "Share it" branded-image action; both the detection engine (needs
/// locally-persisted "seen" state, itself gated on Phase 3's real logging
/// making milestones reachable) and the share action (ImageRenderer, Phase 4
/// per this task's Global Constraints) are deliberately out of scope here.
/// This type exists so it type-checks and a future phase can wire it without
/// re-designing it — it is NOT wired into TodayView's body yet (see
/// TodayView.swift's milestone slot, left as EmptyView()).
struct MilestoneCard: View {
    let title: String
    let subtitle: String
    var onDismiss: () -> Void

    var body: some View {
        HStack(spacing: Theme2.Space.m) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Theme2.Text.title).foregroundStyle(Theme2.blockInk)
                Text(subtitle).font(Theme2.Text.caption).foregroundStyle(Theme2.blockInkSecondary)
            }
            Spacer()
            Button("Nice", action: onDismiss)
                .font(Theme2.Text.caption)
                .padding(.horizontal, Theme2.Space.s).padding(.vertical, Theme2.Space.xs)
                .background(.black).foregroundStyle(.white).clipShape(Capsule())
        }
        .padding(Theme2.Space.l)
        .background(Theme2.Block.lime)
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }
}
