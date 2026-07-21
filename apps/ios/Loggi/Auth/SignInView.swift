import SwiftUI
import ClerkKit

/// Minimal email/password sign-in form. Phase 1 proves the auth flow works end to end;
/// Phase 2 restyles this to match DESIGN.md's auth screen layout.
struct SignInView: View {
    @Environment(Clerk.self) private var clerk
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false
    var onSignUpTapped: () -> Void

    var body: some View {
        VStack(spacing: Theme2.Space.l) {
            Text("Loggi").font(Theme2.Text.headline36).foregroundStyle(Theme2.ink)
            TextField("Email", text: $email)
                .textInputAutocapitalization(.never).keyboardType(.emailAddress)
                .padding(Theme2.Space.s).background(Theme2.hairline)
            SecureField("Password", text: $password)
                .padding(Theme2.Space.s).background(Theme2.hairline)
            if let error { Text(error).foregroundStyle(Theme2.statusOver).font(Theme2.Text.caption) }
            Button(busy ? "Signing in…" : "Sign in") {
                Task { await signIn() }
            }
            .disabled(busy || email.isEmpty || password.isEmpty)
            Button("No account? Sign up", action: onSignUpTapped)
                .foregroundStyle(Theme2.inkSecondary)
        }
        .padding(Theme2.Space.l)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme2.canvas)
    }

    private func signIn() async {
        busy = true; error = nil
        do {
            try await clerk.auth.signInWithPassword(identifier: email, password: password)
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}
