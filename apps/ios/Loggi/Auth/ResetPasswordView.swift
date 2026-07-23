import SwiftUI
import ClerkKit

/// Password reset. Ports (auth)/reset-password.tsx.
///
/// Clerk's flow is three calls, verified against the resolved SDK source
/// (Domains/Auth/SignIn/SignIn.swift) rather than guessed — earlier phases
/// found the SDK's real shape differs from what documentation implies:
///   1. `auth.signInWithEmailCode(emailAddress:)` — creates the SignIn
///   2. `signIn.sendResetPasswordEmailCode()` — swaps to the reset strategy
///   3. `signIn.verifyCode(_:)` then `signIn.resetPassword(newPassword:)`
struct ResetPasswordView: View {
    @Environment(Clerk.self) private var clerk
    @Environment(\.dismiss) private var dismiss

    private enum Stage { case email, code }
    @State private var stage: Stage = .email
    @State private var email = ""
    @State private var code = ""
    @State private var newPassword = ""
    @State private var busy = false
    @State private var error: String?
    @State private var signIn: SignIn?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme2.Space.l) {
                    VStack(alignment: .leading, spacing: Theme2.Space.xs) {
                        Text("RESET").font(Theme2.Text.kicker).foregroundStyle(Theme2.inkSecondary)
                        Text(stage == .email ? "Forgot your password?" : "Check your email")
                            .font(Theme2.Text.headline36).foregroundStyle(Theme2.ink)
                    }

                    SurfaceCard {
                        VStack(alignment: .leading, spacing: Theme2.Space.m) {
                            if stage == .email {
                                Text("We'll send a code to your email.")
                                    .font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary)
                                TextField("you@example.com", text: $email)
                                    .textContentType(.emailAddress)
                                    .keyboardType(.emailAddress)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .font(Theme2.Text.label)
                            } else {
                                Text("Enter the code we sent to \(email), then pick a new password.")
                                    .font(Theme2.Text.body).foregroundStyle(Theme2.inkSecondary)
                                TextField("Code", text: $code)
                                    .textContentType(.oneTimeCode)
                                    .keyboardType(.numberPad)
                                    .font(Theme2.Text.label)
                                SecureField("New password", text: $newPassword)
                                    .textContentType(.newPassword)
                                    .font(Theme2.Text.label)
                            }

                            if let error {
                                Text(error).font(Theme2.Text.caption).foregroundStyle(Theme2.statusOver)
                            }

                            Button {
                                Task { stage == .email ? await sendCode() : await finish() }
                            } label: {
                                HStack {
                                    if busy { ProgressView().tint(Theme2.blockInk) }
                                    Text(stage == .email ? "Send code" : "Reset password")
                                        .font(Theme2.Text.label)
                                }
                                .foregroundStyle(Theme2.blockInk)
                                .frame(maxWidth: .infinity, minHeight: 48)
                                .background(Theme2.accentLog, in: Capsule())
                            }
                            .disabled(busy || (stage == .email
                                               ? email.isEmpty
                                               : (code.isEmpty || newPassword.count < 8)))
                        }
                    }
                }
                .padding(Theme2.Space.l)
            }
            .background(Theme2.canvas)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }

    private func sendCode() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let created = try await clerk.auth.signInWithEmailCode(emailAddress: email)
            signIn = try await created.sendResetPasswordEmailCode()
            stage = .code
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func finish() async {
        guard let signIn else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let verified = try await signIn.verifyCode(code)
            _ = try await verified.resetPassword(newPassword: newPassword)
            // A successful reset signs the user in, so AuthGate takes over.
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
