import SwiftUI
import ClerkKit

/// Shows sign-in/sign-up when signed out, `RootView` when signed in.
/// This is the seam Phase 2 restyles; the plan of record is "prove sign-in works,"
/// not "final auth UI."
struct AuthGate: View {
    @Environment(Clerk.self) private var clerk
    @Binding var route: Route
    @State private var showingSignUp = false

    /// Compiles to a constant `false` in release, so the gallery branch below
    /// is unreachable — and `GalleryView` itself doesn't exist outside DEBUG.
    private var isGalleryRoute: Bool {
        #if DEBUG
        if case .todayPreview = route { return true }
        return route == .gallery
        #else
        return false
        #endif
    }

    @ViewBuilder private var galleryContent: some View {
        #if DEBUG
        if case .todayPreview(let empty) = route {
            // Seed as a body-level statement so the cache is warm BEFORE
            // TodayView is constructed. A sibling .task races TodayView's own
            // .task, whose load() overwrites the seed with an empty network
            // result — that raced and produced a misleading empty screenshot.
            let _ = TodayPreviewSeed.apply(empty: empty)
            TodayView()
        } else {
            GalleryView()
        }
        #else
        EmptyView()
        #endif
    }

    var body: some View {
        Group {
            // The design-system gallery renders pure static components with no
            // account data, so it deliberately bypasses the auth gate — the
            // review/screenshot loop shouldn't need a live Clerk session to
            // look at a colour ramp. `isGalleryRoute` is always false in
            // release builds, so this cannot leak to users.
            if isGalleryRoute {
                galleryContent
            } else if !clerk.isLoaded {
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
