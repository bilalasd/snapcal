import SwiftUI
import ClerkKit

/// Shows sign-in/sign-up when signed out, `RootView` when signed in.
/// This is the seam Phase 2 restyles; the plan of record is "prove sign-in works,"
/// not "final auth UI."
struct AuthGate: View {
    @Environment(Clerk.self) private var clerk
    @Binding var route: Route
    @State private var showingSignUp = false

    var body: some View {
        if !clerk.isLoaded {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).background(Theme.background)
        } else if clerk.user == nil {
            if showingSignUp {
                SignUpView(onSignInTapped: { showingSignUp = false })
            } else {
                SignInView(onSignUpTapped: { showingSignUp = true })
            }
        } else {
            RootView(route: $route)
        }
    }
}
