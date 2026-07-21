import SwiftUI

/// Signed-in root — the real 4-tab shell (Today/History/Weight/Settings),
/// replacing the Phase 2-in-progress placeholder that rendered `TodayView`
/// directly. Ports the tab bar's 4 destinations (DESIGN.md §3 "Tab bar" +
/// mobile's `app/(tabs)/_layout.tsx`) — the RN reference also reserves an
/// empty center slot for a floating "+" speed-dial FAB, but that's Phase 3
/// scope (it opens the log flow, which doesn't exist yet); this task wires
/// navigation only, per Task 8's binding constraint.
struct RootView: View {
    @Binding var route: Route

    /// Local, `Hashable` tab identity for `TabView(selection:)` — `Route`
    /// itself stays `Equatable`-only (it also models non-tab routes like
    /// `.add`/`.askBevi`/auth screens that aren't `Hashable`-safe to tag a
    /// tab with), so this is a thin projection, not a duplicate of `Route`.
    private enum Tab: Hashable { case today, history, weight, settings }

    #if DEBUG
    @State private var galleryOpen = false
    #endif

    /// Two-way bridge to the shared `route` binding: deep links (`-route`
    /// launch arg, `onOpenURL`) that land on `.today`/`.history`/`.weight`/
    /// `.settings` select the matching tab; tapping a tab writes that route
    /// back. Any other route (`.add`, `.askBevi`, auth routes, etc.) is out
    /// of this task's scope — those don't have a tab to select, so the
    /// getter falls back to `.today` without mutating `route` itself.
    private var selection: Binding<Tab> {
        Binding(
            get: {
                switch route {
                case .today: return .today
                case .history: return .history
                case .weight: return .weight
                case .settings: return .settings
                default: return .today
                }
            },
            set: { newTab in
                switch newTab {
                case .today: route = .today
                case .history: route = .history
                case .weight: route = .weight
                case .settings: route = .settings
                }
            }
        )
    }

    var body: some View {
        TabView(selection: selection) {
            TodayView()
                .tabItem { Label("Today", systemImage: "house") }
                .tag(Tab.today)
            HistoryView()
                .tabItem { Label("History", systemImage: "calendar") }
                .tag(Tab.history)
            WeightView()
                .tabItem { Label("Weight", systemImage: "chart.line.uptrend.xyaxis") }
                .tag(Tab.weight)
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
                .tag(Tab.settings)
        }
        .tint(Theme.foreground)
        #if DEBUG
        // Design-system gallery (loggi://gallery). Presented over the tab
        // shell rather than as a tab: it's a review surface, not a feature.
        // Uses a @State mirror rather than .constant(...) so it can be
        // swiped away by hand — .constant would pin it open.
        .fullScreenCover(isPresented: $galleryOpen) { GalleryView() }
        .onAppear { galleryOpen = (route == .gallery) }
        .onChange(of: route) { _, new in galleryOpen = (new == .gallery) }
        #endif
    }
}

#Preview {
    @Previewable @State var route: Route = .today
    RootView(route: $route)
}
