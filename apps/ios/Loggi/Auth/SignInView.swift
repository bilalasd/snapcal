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
        VStack(spacing: Theme.Spacing.m) {
            Text("Loggi").font(Theme.Typography.headline34).foregroundStyle(Theme.foreground)
            TextField("Email", text: $email)
                .textInputAutocapitalization(.never).keyboardType(.emailAddress)
                .padding(Theme.Spacing.s).background(Theme.muted)
            SecureField("Password", text: $password)
                .padding(Theme.Spacing.s).background(Theme.muted)
            if let error { Text(error).foregroundStyle(Theme.destructive).font(Theme.Typography.caption11) }
            Button(busy ? "Signing in…" : "Sign in") {
                Task { await signIn() }
            }
            .disabled(busy || email.isEmpty || password.isEmpty)
            Button("No account? Sign up", action: onSignUpTapped)
                .foregroundStyle(Theme.mutedForeground)
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
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
