import Foundation

enum Route: Equatable {
    case today, history, weight, settings
    case add(intent: String?, date: String?)
    case askBevi, menuScout, onboarding, paywall
    /// DEBUG-only design-system gallery (loggi://gallery). Parsed in all
    /// configurations so the enum shape doesn't vary by build config; only
    /// its presentation in RootView is #if DEBUG.
    case gallery
    case signIn, signUp, resetPassword, welcome

    /// loggi://<path>?<query> — mirrors the expo-router URLs in docs/screenshots.md
    static func parse(_ url: URL) -> Route? {
        guard url.scheme == "loggi" else { return nil }
        // loggi://history parses host="history"; loggi:///history parses path.
        let name = url.host ?? url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func q(_ key: String) -> String? { query.first { $0.name == key }?.value }
        switch name {
        case "", "today": return .today
        case "history": return .history
        case "weight": return .weight
        case "settings": return .settings
        case "add": return .add(intent: q("intent"), date: q("date"))
        case "ask-bevi": return .askBevi
        case "menu-scout": return .menuScout
        case "onboarding": return .onboarding
        case "paywall": return .paywall
        case "sign-in": return .signIn
        case "sign-up": return .signUp
        case "reset-password": return .resetPassword
        case "welcome": return .welcome
        case "gallery": return .gallery
        default: return nil
        }
    }
}
