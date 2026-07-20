import SwiftUI
import ClerkKit

/// Minimal sign-up form: email + password + name, then an email verification code step.
/// Phase 1 proves the flow works end to end; Phase 2 restyles this to match DESIGN.md.
struct SignUpView: View {
    @Environment(Clerk.self) private var clerk
    @State private var email = ""
    @State private var password = ""
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var code = ""
    @State private var isVerifying = false
    @State private var error: String?
    @State private var busy = false
    var onSignInTapped: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.m) {
            Text("Loggi").font(Theme.Typography.headline36).foregroundStyle(Theme.foreground)

            if isVerifying {
                TextField("Verification code", text: $code)
                    .keyboardType(.numberPad)
                    .padding(Theme.Spacing.s).background(Theme.muted)
                if let error { Text(error).foregroundStyle(Theme.destructive).font(Theme.Typography.caption11) }
                Button(busy ? "Verifying…" : "Verify") {
                    Task { await verify() }
                }
                .disabled(busy || code.isEmpty)
            } else {
                TextField("First name", text: $firstName)
                    .padding(Theme.Spacing.s).background(Theme.muted)
                TextField("Last name", text: $lastName)
                    .padding(Theme.Spacing.s).background(Theme.muted)
                TextField("Email", text: $email)
                    .textInputAutocapitalization(.never).keyboardType(.emailAddress)
                    .padding(Theme.Spacing.s).background(Theme.muted)
                SecureField("Password", text: $password)
                    .padding(Theme.Spacing.s).background(Theme.muted)
                if let error { Text(error).foregroundStyle(Theme.destructive).font(Theme.Typography.caption11) }
                Button(busy ? "Signing up…" : "Sign up") {
                    Task { await signUp() }
                }
                .disabled(busy || email.isEmpty || password.isEmpty)
            }

            Button("Already have an account? Sign in", action: onSignInTapped)
                .foregroundStyle(Theme.mutedForeground)
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
    }

    private func signUp() async {
        busy = true; error = nil
        do {
            let signUp = try await clerk.auth.signUp(
                emailAddress: email,
                password: password,
                firstName: firstName,
                lastName: lastName
            )
            try await signUp.sendEmailCode()
            isVerifying = true
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }

    private func verify() async {
        busy = true; error = nil
        do {
            guard let signUp = clerk.auth.currentSignUp else {
                error = "No sign-up in progress."
                busy = false
                return
            }
            _ = try await signUp.verifyEmailCode(code)
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}
