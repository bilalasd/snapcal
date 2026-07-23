import SwiftUI

/// First screen a brand-new user sees. Ports (auth)/welcome.tsx — a short
/// carousel that makes the promise before asking for an account.
struct WelcomeView: View {
    @State private var page = 0
    var onGetStarted: () -> Void
    var onSignIn: () -> Void

    private struct Slide {
        let bevi: String
        let title: String
        let body: String
    }
    private let slides = [
        Slide(bevi: "bevi-wave", title: "Logging, without the chore",
              body: "Snap your plate. Loggi works out what's on it — no searching, no scanning barcodes for a home-cooked meal."),
        Slide(bevi: "bevi-scale", title: "A number that adapts",
              body: "Your target follows your real weight trend and your real burn rate, not a formula guess from day one."),
        Slide(bevi: "bevi-promise", title: "No tricks",
              body: "Fifteen days free, then $4.99 a month. Cancel anytime, export everything, delete it all if you want."),
    ]

    var body: some View {
        VStack(spacing: Theme2.Space.l) {
            TabView(selection: $page) {
                ForEach(slides.indices, id: \.self) { index in
                    let slide = slides[index]
                    VStack(spacing: Theme2.Space.l) {
                        Image(slide.bevi)
                            .resizable().scaledToFit()
                            .frame(maxHeight: 220)
                            .accessibilityHidden(true)
                        Text(slide.title)
                            .font(Theme2.Text.headline36)
                            .foregroundStyle(Theme2.ink)
                            .multilineTextAlignment(.center)
                        Text(slide.body)
                            .font(Theme2.Text.body)
                            .foregroundStyle(Theme2.inkSecondary)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(Theme2.Space.l)
                    .tag(index)
                }
            }
            .tabViewStyle(.page)

            VStack(spacing: Theme2.Space.m) {
                Button {
                    onGetStarted()
                } label: {
                    Text("Get started").font(Theme2.Text.label)
                        .foregroundStyle(Theme2.blockInk)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(Theme2.accentLog, in: Capsule())
                }

                Button("I already have an account", action: onSignIn)
                    .font(Theme2.Text.body)
                    .tint(Theme2.ink)
            }
            .padding(Theme2.Space.l)
        }
        .background(Theme2.canvas)
    }
}
