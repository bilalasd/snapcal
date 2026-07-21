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
        VStack(alignment: .leading, spacing: Theme2.Space.xs) {
            Text("Weekly recap").font(Theme2.Text.title).foregroundStyle(Theme2.blockInk)
            Text("Week of \(recap.weekStart)").font(Theme2.Text.caption).foregroundStyle(Theme2.blockInkSecondary)
            Text(recap.content).font(Theme2.Text.body).foregroundStyle(Theme2.blockInk)
                .padding(.top, Theme2.Space.xs)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme2.Space.l)
        // block.lilac per apps/mobile/lib/colors.ts + monday-note-card.tsx's
        // `backgroundColor: block.lilac` — the brief's own prose says "lilac
        // card" but its sample code said Theme2.Block.coral; RN source (the
        // actual authority here per AGENTS.md) confirms lilac. See task-3-report.md.
        .background(Theme2.Block.lilac)
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }
}
