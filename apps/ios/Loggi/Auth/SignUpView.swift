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
        VStack(spacing: Theme2.Space.l) {
            Text("Loggi").font(Theme2.Text.headline36).foregroundStyle(Theme2.ink)

            if isVerifying {
                TextField("Verification code", text: $code)
                    .keyboardType(.numberPad)
                    .padding(Theme2.Space.s).background(Theme2.hairline)
                if let error { Text(error).foregroundStyle(Theme2.statusOver).font(Theme2.Text.caption) }
                Button(busy ? "Verifying…" : "Verify") {
                    Task { await verify() }
                }
                .disabled(busy || code.isEmpty)
            } else {
                TextField("First name", text: $firstName)
                    .padding(Theme2.Space.s).background(Theme2.hairline)
                TextField("Last name", text: $lastName)
                    .padding(Theme2.Space.s).background(Theme2.hairline)
                TextField("Email", text: $email)
                    .textInputAutocapitalization(.never).keyboardType(.emailAddress)
                    .padding(Theme2.Space.s).background(Theme2.hairline)
                SecureField("Password", text: $password)
                    .padding(Theme2.Space.s).background(Theme2.hairline)
                if let error { Text(error).foregroundStyle(Theme2.statusOver).font(Theme2.Text.caption) }
                Button(busy ? "Signing up…" : "Sign up") {
                    Task { await signUp() }
                }
                .disabled(busy || email.isEmpty || password.isEmpty)
            }

            Button("Already have an account? Sign in", action: onSignInTapped)
                .foregroundStyle(Theme2.inkSecondary)
        }
        .padding(Theme2.Space.l)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme2.canvas)
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
