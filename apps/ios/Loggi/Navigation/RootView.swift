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
