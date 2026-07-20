import SwiftUI

/// Signed-in root. `route` will drive a real `TabView` in Task 8 (tab shell);
/// until then this hosts `TodayView` directly so Phase 2's screens are each
/// independently buildable/verifiable as they land.
struct RootView: View {
    @Binding var route: Route

    var body: some View {
        TodayView()
    }
}

#Preview {
    @Previewable @State var route: Route = .today
    RootView(route: $route)
}
