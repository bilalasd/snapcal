import SwiftUI
import StoreKit

/// The paywall. Ports paywall.tsx — including its tone, which matters here:
/// the welcome copy promises "no tricks", so this screen states the price
/// plainly, names the date the trial ends, and never hides the cancel path.
struct PaywallView: View {
    @State private var store = Subscriptions.shared
    @State private var error: String?
    var onDone: () -> Void

    private var trialEndsText: String {
        let end = Date().addingTimeInterval(15 * 86_400)
        return end.formatted(.dateTime.month(.wide).day())
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme2.Space.l) {
                VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                    Text("15 DAYS FREE").font(Theme2.Text.kicker).foregroundStyle(Theme2.inkSecondary)
                    Text("Try the whole thing").font(Theme2.Text.headline36).foregroundStyle(Theme2.ink)
                }

                Text("The whole product, nothing held back. If Loggi isn't earning its keep, cancel before \(trialEndsText) and you won't be charged.")
                    .font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary)

                if store.loadFailed {
                    SurfaceCard {
                        HStack(alignment: .top, spacing: Theme2.Space.m) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(Theme2.statusOver)
                            Text("The App Store isn't responding. Prices and the free trial live there — try again in a moment, or sort this out later.")
                                .font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary)
                        }
                    }
                }

                planCard(id: Subscriptions.monthlyID, title: "Monthly",
                         blurb: "Month by month. Cancel anytime.", tone: .cream)
                planCard(id: Subscriptions.yearlyID, title: "Yearly",
                         blurb: "Two months free. A convenience, not a trap.", tone: .lime)

                if let error {
                    Text(error).font(Theme2.Text.caption).foregroundStyle(Theme2.statusOver)
                }

                Button("Restore purchases") {
                    Task {
                        if await store.restore() { onDone() }
                        else { error = "Nothing to restore on this Apple Account." }
                    }
                }
                .font(Theme2.Text.body)
                .tint(Theme2.ink)

                Text("Auto-renews after the trial ends; manage or cancel anytime in your App Store settings. Your data stays yours either way — export or delete it whenever you like.")
                    .font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)

                HStack(spacing: Theme2.Space.l) {
                    Link("Terms", destination: URL(string: "https://loggi.app/terms")!)
                    Link("Privacy", destination: URL(string: "https://loggi.app/privacy")!)
                }
                .font(Theme2.Text.caption)
                .tint(Theme2.inkSecondary)
            }
            .padding(Theme2.Space.l)
        }
        .background(Theme2.canvas)
        .task { await store.load() }
        .onChange(of: store.isSubscribed) { _, subscribed in
            if subscribed { onDone() }
        }
    }

    private func planCard(id: String, title: String, blurb: String, tone: PastelTone) -> some View {
        Button {
            Task {
                switch await store.purchase(id) {
                case .success: onDone()
                case .cancelled: break
                case .pending: error = "That purchase needs approval — we'll unlock it as soon as it clears."
                case .failed(let message): error = message
                }
            }
        } label: {
            PastelCard(tone: tone) {
                    HStack {
                        VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                            Text("\(title) · \(store.price(for: id))")
                                .font(Theme2.Text.title)
                            Text(blurb)
                                .font(Theme2.Text.caption)
                                .foregroundStyle(Theme2.blockInkSecondary)
                                .multilineTextAlignment(.leading)
                        }
                        Spacer(minLength: Theme2.Space.s)
                        if store.purchasing == id {
                            ProgressView()
                        } else {
                            Image(systemName: "chevron.right")
                        }
                    }
            }
        }
        .buttonStyle(.plain)
        .disabled(store.purchasing != nil)
        .accessibilityLabel("\(title) plan, \(store.price(for: id))")
    }
}
