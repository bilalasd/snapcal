import SwiftUI
import ClerkKit

/// Shows sign-in/sign-up when signed out, `RootView` when signed in.
/// This is the seam Phase 2 restyles; the plan of record is "prove sign-in works,"
/// not "final auth UI."
struct AuthGate: View {
    @Environment(Clerk.self) private var clerk
    @Binding var route: Route
    @State private var showingSignUp = false
    /// Only shown once per launch for a signed-out user — returning users
    /// hitting sign-in don't want the carousel again.
    @State private var showingWelcome = true
    @State private var showingReset = false
    @State private var onboarded = false
    @State private var paywallCleared = false
    @State private var goalsChecked = false
    @State private var hasGoals = false

    /// True until the account has goals. `goalsChecked` keeps the app from
    /// flashing onboarding during the first fetch — an unchecked nil reads
    /// identically to "never onboarded".
    private var needsOnboarding: Bool {
        guard goalsChecked, !onboarded else { return false }
        return !hasGoals
    }

    /// The paywall follows onboarding once, per RN's router.replace("/paywall").
    /// A subscribed user skips it; so does anyone who already got past it this
    /// launch.
    private var needsPaywall: Bool {
        guard goalsChecked, !paywallCleared else { return false }
        return (onboarded || hasGoals) && !Subscriptions.shared.isSubscribed && onboarded
    }

    /// Compiles to a constant `false` in release, so the gallery branch below
    /// is unreachable — and `GalleryView` itself doesn't exist outside DEBUG.
    private var isGalleryRoute: Bool {
        #if DEBUG
        if case .todayPreview = route { return true }
        return route == .gallery || route == .onboardingPreview || route == .paywallPreview
        #else
        return false
        #endif
    }

    @ViewBuilder private var galleryContent: some View {
        #if DEBUG
        if route == .onboardingPreview {
            OnboardingView {}
        } else if route == .paywallPreview {
            PaywallView {}
        } else if case .todayPreview(let empty) = route {
            // Seed as a body-level statement so the cache is warm BEFORE
            // TodayView is constructed. A sibling .task races TodayView's own
            // .task, whose load() overwrites the seed with an empty network
            // result — that raced and produced a misleading empty screenshot.
            let _ = TodayPreviewSeed.apply(empty: empty)
            let _ = TodayPreviewSeed.applyRange()
            RootView(route: $route)
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
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).background(Theme2.canvas)
            } else if clerk.user == nil {
                if showingWelcome {
                    // The promise before the ask: a brand-new user sees what
                    // the app does before being asked for an account.
                    WelcomeView(
                        onGetStarted: { showingWelcome = false; showingSignUp = true },
                        onSignIn: { showingWelcome = false; showingSignUp = false })
                } else if showingSignUp {
                    SignUpView(onSignInTapped: { showingSignUp = false })
                } else {
                    SignInView(onSignUpTapped: { showingSignUp = true })
                        .overlay(alignment: .bottom) {
                            Button("Forgot password?") { showingReset = true }
                                .font(Theme2.Text.caption)
                                .tint(Theme2.inkSecondary)
                                .padding(.bottom, Theme2.Space.xl)
                        }
                        .sheet(isPresented: $showingReset) { ResetPasswordView() }
                }
            } else if !goalsChecked {
                // Don't route until the account's onboarded-state is known.
                // Without this the body's default arm renders Today for a beat,
                // then the goals fetch resolves and bounces a not-onboarded
                // account to onboarding — which reads as the UI "reverting" to
                // the old screen (it flashes Today, then jumps away). A loader
                // until `goalsChecked` removes that flash; a returning onboarded
                // user clears it in one frame from the warm cache path in .task.
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Theme2.canvas)
            } else if needsOnboarding {
                // A signed-in account with no goals has never finished setup.
                // Sending them to the tabs would show a zero-calorie budget and
                // read as broken, so onboarding gates the app rather than
                // sitting behind a banner.
                OnboardingView { onboarded = true }
            } else if needsPaywall {
                PaywallView { paywallCleared = true }
            } else {
                RootView(route: $route)
            }
        }
        .task(id: clerk.user?.id) {
            guard clerk.user != nil else { return }
            MealCache.shared.hydrate()
            if let cached = MealCache.shared.cachedGoals() {
                hasGoals = cached.onboarded
                goalsChecked = true
            }
            if let goals: Goals = try? await APIClient.shared.get("/api/goals") {
                MealCache.shared.setGoals(goals)
                hasGoals = goals.onboarded
            }
            goalsChecked = true
            await Subscriptions.shared.load()
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
