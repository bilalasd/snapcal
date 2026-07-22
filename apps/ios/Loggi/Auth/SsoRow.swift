import SwiftUI
import ClerkKit

/// Apple + Google sign-in, ported from components/sso.tsx. Shown on both the
/// sign-in and sign-up screens.
///
/// Two reasons this exists beyond parity:
///  - **App Store compliance.** Offering Google (a third-party login) without
///    Sign in with Apple is a guideline-4.8 rejection.
///  - **HIG.** Sign in with Apple leads, ahead of other providers.
///
/// Unlike RN (which used Clerk's web `oauth_apple` flow), this uses the SDK's
/// NATIVE `signInWithApple()` — the correct path on Apple platforms, and what
/// the `com.apple.developer.applesignin` entitlement is for. Clerk runs the
/// ASAuthorization sheet itself; on success the user is signed in and AuthGate
/// takes over, so there's nothing to handle here but errors.
///
/// UNVERIFIED end to end: the button renders and the Clerk calls are checked
/// against the resolved SDK, but the actual OAuth round trip needs a real
/// device run (Sign in with Apple doesn't work in the simulator without an
/// Apple ID signed into it, and Google opens a real browser).
struct SsoRow: View {
    @Environment(Clerk.self) private var clerk
    @State private var busy: String?
    @State private var error: String?

    var body: some View {
        VStack(spacing: Theme2.Space.m) {
            HStack(spacing: Theme2.Space.m) {
                Rectangle().fill(Theme2.hairline).frame(height: 1)
                Text("or").font(Theme2.Text.caption).foregroundStyle(Theme2.inkSecondary)
                Rectangle().fill(Theme2.hairline).frame(height: 1)
            }

            // Apple leads (HIG). Styled to Apple's spec: black fill, white
            // logo + label, the system Apple glyph.
            Button {
                Task { await signInWithApple() }
            } label: {
                Label {
                    Text("Continue with Apple").font(Theme2.Text.label)
                } icon: {
                    Image(systemName: "apple.logo")
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(.black, in: RoundedRectangle(cornerRadius: Theme2.Radius.control))
            }
            .overlay { if busy == "apple" { ProgressView().tint(.white) } }
            .disabled(busy != nil)
            .accessibilityLabel("Continue with Apple")

            Button {
                Task { await signInWithGoogle() }
            } label: {
                Label {
                    Text("Continue with Google").font(Theme2.Text.label)
                } icon: {
                    Image(systemName: "g.circle.fill")
                }
                .foregroundStyle(Theme2.ink)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(Theme2.surface, in: RoundedRectangle(cornerRadius: Theme2.Radius.control))
                .overlay(RoundedRectangle(cornerRadius: Theme2.Radius.control).strokeBorder(Theme2.hairline))
            }
            .overlay { if busy == "google" { ProgressView() } }
            .disabled(busy != nil)
            .accessibilityLabel("Continue with Google")

            if let error {
                Text(error).font(Theme2.Text.caption).foregroundStyle(Theme2.statusOver)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private func signInWithApple() async {
        busy = "apple"; error = nil
        defer { busy = nil }
        do {
            // Clerk drives the native ASAuthorization sheet; the transferable
            // flow it defaults to signs an existing user in or creates the
            // account, so one call covers both sign-in and sign-up.
            _ = try await clerk.auth.signInWithApple()
        } catch {
            // A user dismissing the sheet isn't an error worth surfacing.
            if !error.isUserCancellation {
                self.error = error.localizedDescription
            }
        }
    }

    private func signInWithGoogle() async {
        busy = "google"; error = nil
        defer { busy = nil }
        do {
            _ = try await clerk.auth.signInWithOAuth(provider: .google)
        } catch {
            if !error.isUserCancellation {
                self.error = error.localizedDescription
            }
        }
    }
}
