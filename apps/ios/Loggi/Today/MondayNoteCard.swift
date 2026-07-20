import SwiftUI

/// Weekly recap ("Trend desk") card — shown on Today only (not past days),
/// only when `trends.recap` exists. Ports the visible-content half of
/// apps/mobile/components/monday-note-card.tsx: verdict/goal/audit chips,
/// per-week dismiss state, and the Monday-note-notification opt-in offer all
/// live in RN's own AsyncStorage-backed helpers (lib/monday-note.ts) and are
/// Phase 4 scope per the task brief's Global Constraints (notification
/// toggles deferred) — this card is the always-visible recap prose only.
struct MondayNoteCard: View {
    let recap: WeeklyRecap
    let verdictStatus: VerdictStatus

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text("Weekly recap").font(.system(size: 20, weight: .black)).foregroundStyle(.black)
            Text("Week of \(recap.weekStart)").font(Theme.Typography.caption11).foregroundStyle(.black.opacity(0.6))
            Text(recap.content).font(.system(size: 14)).foregroundStyle(.black)
                .padding(.top, Theme.Spacing.xs)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.m)
        // block.lilac per apps/mobile/lib/colors.ts + monday-note-card.tsx's
        // `backgroundColor: block.lilac` — the brief's own prose says "lilac
        // card" but its sample code said Theme.blockCoral; RN source (the
        // actual authority here per AGENTS.md) confirms lilac. See task-3-report.md.
        .background(Theme.blockLilac)
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }
}
