#if DEBUG
import Foundation

enum RouteTests {
    static func runAssertions() {
        assert(Route.parse(URL(string: "loggi://history")!) == .history)
        assert(Route.parse(URL(string: "loggi://add?intent=speak")!) == .add(intent: "speak", date: nil))
        assert(Route.parse(URL(string: "loggi://add?intent=search&date=2026-07-20")!) == .add(intent: "search", date: "2026-07-20"))
        assert(Route.parse(URL(string: "loggi://")!) == .today)
        assert(Route.parse(URL(string: "https://history")!) == nil)
    }
}
#endif
