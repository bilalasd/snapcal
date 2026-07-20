import ClerkKit
import SwiftUI

@main
struct LoggiApp: App {
    @State private var route: Route = LoggiApp.initialRoute()

    init() {
        Clerk.configure(publishableKey: Config.clerkPublishableKey)
        #if DEBUG
        RouteTests.runAssertions()
        #endif
    }

    /// Supports `-route <path>` as a launch argument (e.g. `xcrun simctl launch <udid> com.loggi.app -route history`)
    /// so navigation can be driven deterministically in headless automation, bypassing the dual-simulator
    /// `booted` ambiguity and the untappable "Open in Loggi?" confirmation dialog on first custom-scheme open.
    static func initialRoute() -> Route {
        let arguments = ProcessInfo.processInfo.arguments
        guard let flagIndex = arguments.firstIndex(of: "-route"),
              arguments.indices.contains(flagIndex + 1) else {
            return .today
        }
        let value = arguments[flagIndex + 1]
        guard let url = URL(string: "loggi://\(value)"), let route = Route.parse(url) else {
            return .today
        }
        return route
    }

    var body: some Scene {
        WindowGroup {
            AuthGate(route: $route)
                .environment(Clerk.shared)
                .onOpenURL { url in
                    if let r = Route.parse(url) {
                        route = r
                    }
                }
        }
    }
}
