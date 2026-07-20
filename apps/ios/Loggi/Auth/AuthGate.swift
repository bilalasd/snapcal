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
        Group {
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
        // Sign-out safety net ahead of Phase 2's real sign-out UI: Clerk
        // persists sessions across launches and MealCache.hydrate() loads
        // whatever is on disk regardless of which user is signed in, so a
        // signed-in -> signed-out transition (not the initial nil-on-launch
        // state) must clear the cache before a second account can sign in.
        .onChange(of: clerk.user?.id) { oldUserId, newUserId in
            if oldUserId != nil && newUserId == nil {
                MealCache.shared.clear()
            }
        }
    }
}
