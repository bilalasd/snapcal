import SwiftUI

struct RootView: View {
    @Binding var route: Route

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text("PHASE 0 PLACEHOLDER")
                .font(Theme.Typography.kicker12)
                .foregroundStyle(Theme.mutedForeground)
                .kerning(2)

            Text(route.label)
                .font(Theme.Typography.headline34)
                .foregroundStyle(Theme.foreground)

            if case .add(let intent, let date) = route {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    if let intent = intent {
                        Text("intent: \(intent)")
                            .font(Theme.Typography.caption11)
                            .foregroundStyle(Theme.foreground)
                    }
                    if let date = date {
                        Text("date: \(date)")
                            .font(Theme.Typography.caption11)
                            .foregroundStyle(Theme.foreground)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(Theme.Spacing.l)
        .background(Theme.background)
        // TEMPORARY (Task 4 placeholder): exercises APIClient's GET path once this
        // view is reachable (i.e. once a session exists). Task 5 replaces this with
        // the real cache-backed goals fetch. End-to-end reachability against the
        // production API was verified separately (see task-4-report.md) since this
        // view isn't mounted until AuthGate sees a signed-in user.
        .task {
            do {
                let goals: Goals = try await APIClient.shared.get("/api/goals")
                print("Fetched goals: \(goals)")
            } catch {
                print("Fetch failed: \(error)")
            }
        }
    }
}

extension Route {
    var label: String {
        switch self {
        case .today: return "today"
        case .history: return "history"
        case .weight: return "weight"
        case .settings: return "settings"
        case .add: return "add"
        case .askBevi: return "ask-bevi"
        case .menuScout: return "menu-scout"
        case .onboarding: return "onboarding"
        case .paywall: return "paywall"
        case .signIn: return "sign-in"
        case .signUp: return "sign-up"
        case .resetPassword: return "reset-password"
        case .welcome: return "welcome"
        }
    }
}

#Preview {
    @Previewable @State var route: Route = .today
    RootView(route: $route)
}
