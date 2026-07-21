import SwiftUI

/// The warm raised surface (spec §3.0). Every card, row group and sheet
/// background in the new system goes through this — that's what keeps the
/// raised-surface contrast constraint honest, since PaletteTests validates
/// data colours against `Theme2.surface` specifically.
struct SurfaceCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(Theme2.Space.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme2.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme2.Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme2.Radius.card, style: .continuous)
                    .strokeBorder(Theme2.hairline, lineWidth: 1)
            )
    }
}
