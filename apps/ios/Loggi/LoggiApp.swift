import SwiftUI

@main
struct LoggiApp: App {
    @State private var route: Route = .today

    init() {
        #if DEBUG
        RouteTests.runAssertions()
        #endif
    }

    var body: some Scene {
        WindowGroup {
            RootView(route: $route)
                .onOpenURL { url in
                    if let r = Route.parse(url) {
                        route = r
                    }
                }
        }
    }
}
