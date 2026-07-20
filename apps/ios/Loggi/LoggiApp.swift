import SwiftUI

@main
struct LoggiApp: App {
    var body: some Scene {
        WindowGroup {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                Text("PLAN DESK").font(Theme.Typography.kicker12)
                    .foregroundStyle(Theme.mutedForeground).kerning(2)
                Text("Loggi").font(Theme.Typography.headline34)
                    .foregroundStyle(Theme.foreground)
                HStack(spacing: Theme.Spacing.s) {
                    ForEach([Theme.blockLime, Theme.blockLilac, Theme.blockCream,
                             Theme.blockMint, Theme.blockCoral, Theme.accentLog],
                            id: \.self) { c in
                        RoundedRectangle(cornerRadius: 8).fill(c).frame(width: 40, height: 40)
                    }
                }
                Image("bevi-standing").resizable().scaledToFit().frame(height: 160)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(Theme.Spacing.l)
            .background(Theme.background)
        }
    }
}
