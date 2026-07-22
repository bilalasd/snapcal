import SwiftUI
import ClerkKit

/// Email/password sign-in, with Client Trust handling.
///
/// Clerk's Client Trust (credential-stuffing protection) intercepts a
/// password sign-in from a new device and returns status `needsClientTrust`
/// instead of completing — it needs a one-time email code first. Without
/// handling that, the sign-in silently stalls (no error, no transition): a
/// real bug for any user on a new device, not just a test-only quirk. So a
/// `needsClientTrust` result drops into an email-code step. (OAuth/Apple/
/// passkey don't trigger it, so only this password path needs it.)
struct SignInView: View {
    @Environment(Clerk.self) private var clerk
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var error: String?
    @State private var busy = false
    /// Set when Client Trust requires an email code; holds the in-progress
    /// SignIn so the code step can complete the same attempt.
    @State private var trustPending: SignIn?
    var onSignUpTapped: () -> Void

    var body: some View {
        VStack(spacing: Theme2.Space.l) {
            Text("Loggi").font(Theme2.Text.headline36).foregroundStyle(Theme2.ink)

            if trustPending != nil {
                Text("New device — enter the code we emailed to \(email).")
                    .font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary)
                    .multilineTextAlignment(.center)
                TextField("Verification code", text: $code)
                    .textContentType(.oneTimeCode).keyboardType(.numberPad)
                    .padding(Theme2.Space.s).background(Theme2.hairline)
                if let error { Text(error).foregroundStyle(Theme2.statusOver).font(Theme2.Text.caption) }
                Button(busy ? "Verifying…" : "Verify") { Task { await verifyTrust() } }
                    .disabled(busy || code.count < 4)
            } else {
                TextField("Email", text: $email)
                    .textInputAutocapitalization(.never).keyboardType(.emailAddress)
                    .padding(Theme2.Space.s).background(Theme2.hairline)
                SecureField("Password", text: $password)
                    .padding(Theme2.Space.s).background(Theme2.hairline)
                if let error { Text(error).foregroundStyle(Theme2.statusOver).font(Theme2.Text.caption) }
                Button(busy ? "Signing in…" : "Sign in") { Task { await signIn() } }
                    .disabled(busy || email.isEmpty || password.isEmpty)
                SsoRow()
                Button("No account? Sign up", action: onSignUpTapped)
                    .foregroundStyle(Theme2.inkSecondary)
            }
        }
        .padding(Theme2.Space.l)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme2.canvas)
    }

    private func signIn() async {
        busy = true; error = nil
        do {
            let signIn = try await clerk.auth.signInWithPassword(identifier: email, password: password)
            if signIn.status == .needsClientTrust {
                // New-device credential-stuffing check: send the email code and
                // move to the code step. If a real user has MFA on instead,
                // that surfaces as .needsSecondFactor, handled the same way.
                trustPending = try await signIn.sendMfaEmailCode()
            }
            // .complete signs the user in; AuthGate transitions automatically.
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }

    private func verifyTrust() async {
        guard let signIn = trustPending else { return }
        busy = true; error = nil
        do {
            _ = try await signIn.verifyMfaCode(code, type: .emailCode)
            // On success the session activates and AuthGate takes over.
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}
