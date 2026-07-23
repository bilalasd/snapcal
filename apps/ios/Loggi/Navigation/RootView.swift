import SwiftUI
import UIKit

extension Notification.Name {
    /// Posted when the add flow closes so Today (which no longer owns the FAB)
    /// refreshes its journal from the cache/server.
    static let loggiMealsChanged = Notification.Name("loggiMealsChanged")
}

/// Signed-in root: the 4-tab shell with a **center speed-dial** seated in the
/// bar's empty middle slot (DESIGN.md §3 "Speed dial" / §4.4). Ports the RN
/// `(tabs)/_layout.tsx` — a custom bar (the native `TabView` can't reserve a
/// center socket), a 76pt vermilion "+" that taps or **holds-and-drags** to
/// fan out Camera / Describe / Speak / Saved, pie-menu drag selection with
/// haptics, and a tap-away scrim. Every action is also plain-tappable.
struct RootView: View {
    @Binding var route: Route
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private enum Tab: Hashable { case today, history, weight, settings }

    // Speed-dial state.
    @State private var fabOpen = false
    @State private var dragActive: Int?
    @State private var dragBegan = false
    @State private var fabWasOpen = false
    @State private var addMode: AddMealViewModel.Mode?
    @State private var cameraOpen = false
    #if DEBUG
    @State private var galleryOpen = false
    #endif

    /// Fan actions. `dx`/`dy` are each action-circle's center offset from the
    /// "+" center (points) — they drive both the fan-out and the drag bearing
    /// test, exactly like the RN ACTIONS table.
    private struct FanAction: Identifiable {
        let id = UUID()
        let mode: AddMealViewModel.Mode
        let icon: String
        let label: String
        let dx: CGFloat
        let dy: CGFloat
    }
    private let actions: [FanAction] = [
        .init(mode: .describe, icon: "text.cursor",   label: "Describe", dx: -104, dy: -44),
        .init(mode: .camera,   icon: "camera.fill",   label: "Camera",   dx: -38,  dy: -106),
        .init(mode: .speak,    icon: "mic.fill",      label: "Speak",    dx: 38,   dy: -106),
        .init(mode: .saved,    icon: "bookmark.fill", label: "Saved",    dx: 104,  dy: -44),
    ]
    private let minDrag: CGFloat = 24
    private let minDot: CGFloat = 0.5 // cos 60°

    private var currentTab: Tab {
        #if DEBUG
        if case .todayPreview = route {
            let args = ProcessInfo.processInfo.arguments
            if let i = args.firstIndex(of: "-preview-tab"), i + 1 < args.count {
                switch args[i + 1] {
                case "history": return .history
                case "weight": return .weight
                case "settings": return .settings
                default: return .today
                }
            }
            return .today
        }
        #endif
        switch route {
        case .history: return .history
        case .weight: return .weight
        case .settings: return .settings
        default: return .today
        }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            // safeAreaInset insets the screen's content above the bar, so nothing
            // scrolls out below/around the floating tab bar (the earlier peek).
            screen
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    // Opaque canvas strip behind the floating bar (extending into
                    // the home-indicator area) so scroll content can't peek out
                    // in the gaps around the pill.
                    tabBar
                        .frame(maxWidth: .infinity)
                        .background { Theme2.canvas.ignoresSafeArea(edges: .bottom) }
                }

            if fabOpen {
                Color.black.opacity(0.3)
                    .ignoresSafeArea()
                    .transition(.opacity)
                    .onTapGesture { setFab(false) }
            }

            speedDial
        }
        .background(Theme2.canvas)
        .sheet(item: $addMode) { mode in
            AddMealView(targetDate: Date(), initialMode: mode)
                .onDisappear { NotificationCenter.default.post(name: .loggiMealsChanged, object: nil) }
        }
        .fullScreenCover(isPresented: $cameraOpen) {
            CaptureView(targetDate: Date())
                .onDisappear { NotificationCenter.default.post(name: .loggiMealsChanged, object: nil) }
        }
        #if DEBUG
        .fullScreenCover(isPresented: $galleryOpen) { GalleryView() }
        .onAppear { galleryOpen = (route == .gallery) }
        .onChange(of: route) { _, new in galleryOpen = (new == .gallery) }
        #endif
    }

    @ViewBuilder private var screen: some View {
        switch currentTab {
        case .today: TodayView()
        case .history: HistoryView()
        case .weight: WeightView()
        case .settings: SettingsView()
        }
    }

    // MARK: - Tab bar

    private var tabBar: some View {
        HStack(spacing: 0) {
            tabButton(.today, "Today", "house.fill")
            tabButton(.history, "History", "calendar")
            Color.clear.frame(width: 76, height: 44) // the socket the "+" sits in
            tabButton(.weight, "Weight", "chart.line.uptrend.xyaxis")
            tabButton(.settings, "Settings", "gearshape.fill")
        }
        .padding(.horizontal, Theme2.Space.xs)
        .padding(.top, Theme2.Space.s)
        .padding(.bottom, Theme2.Space.xs)
        .background(Theme2.surface)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Theme2.hairline, lineWidth: 1))
        .padding(.horizontal, Theme2.Space.m)
    }

    private func tabButton(_ tab: Tab, _ label: String, _ icon: String) -> some View {
        Button {
            route = routeFor(tab)
        } label: {
            VStack(spacing: 3) {
                Image(systemName: icon).font(.system(size: 20))
                Text(label.uppercased()).font(.system(size: 10, weight: .heavy))
            }
            .foregroundStyle(currentTab == tab ? Theme2.ink : Theme2.inkSecondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, Theme2.Space.xs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(currentTab == tab ? [.isSelected] : [])
    }

    // MARK: - Speed dial

    private var speedDial: some View {
        ZStack {
            ForEach(Array(actions.enumerated()), id: \.element.id) { i, action in
                fanAction(i, action)
            }
            fab
        }
        // Raise the "+" so its center sits in the bar's socket, above the top edge.
        .offset(y: -30)
    }

    private func fanAction(_ i: Int, _ action: FanAction) -> some View {
        Button { go(action.mode) } label: {
            VStack(spacing: Theme2.Space.xs) {
                Image(systemName: action.icon)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(Theme2.accentLog, in: Circle())
                    .scaleEffect(dragActive == i ? 1.18 : 1)
                Text(action.label.uppercased())
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundStyle(Theme2.ink)
                    .padding(.horizontal, Theme2.Space.s)
                    .padding(.vertical, 2)
                    .background(Theme2.surface, in: Capsule())
            }
        }
        .buttonStyle(.plain)
        // Transforms OUTSIDE the Button so the tap target moves with the icon —
        // an `.offset` inside the label moves the visual but leaves the hit area
        // stranded at the FAB center.
        .scaleEffect(fabOpen ? 1 : 0.4)
        .opacity(fabOpen ? 1 : 0)
        .offset(x: fabOpen ? action.dx : 0, y: fabOpen ? action.dy : 0)
        .allowsHitTesting(fabOpen)
        .accessibilityLabel(action.label)
        .accessibilityHidden(!fabOpen)
    }

    private var fab: some View {
        ZStack {
            Circle().fill(Theme2.canvas).frame(width: 76, height: 76)
                .overlay(Circle().stroke(Theme2.hairline, lineWidth: 1))
            Image(systemName: "plus")
                .font(.system(size: 26, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(Theme2.accentLog, in: Circle())
                .rotationEffect(.degrees(fabOpen ? 45 : 0))
        }
        .contentShape(Circle())
        .gesture(fabDrag)
        .accessibilityLabel("Log a meal")
        .accessibilityAddTraits(.isButton)
    }

    private var fabDrag: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                if !dragBegan {
                    dragBegan = true
                    fabWasOpen = fabOpen
                    if !fabOpen { setFab(true) }
                }
                let t = value.translation
                let dist = hypot(t.width, t.height)
                var idx: Int?
                if dist > minDrag {
                    var best = minDot
                    for (i, a) in actions.enumerated() {
                        let dot = (t.width * a.dx + t.height * a.dy) / (dist * hypot(a.dx, a.dy))
                        if dot > best { best = dot; idx = i }
                    }
                }
                if idx != dragActive {
                    if idx != nil { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
                    withAnimation(reduceMotion ? nil : Theme2.Motion.pop) { dragActive = idx }
                }
            }
            .onEnded { value in
                let idx = dragActive
                let t = value.translation
                dragBegan = false
                withAnimation(reduceMotion ? nil : Theme2.Motion.pop) { dragActive = nil }
                if let idx {
                    go(actions[idx].mode)
                } else if fabWasOpen && hypot(t.width, t.height) < 10 {
                    setFab(false)
                }
                // release-in-place while closed keeps it open for tap-to-choose
            }
    }

    // MARK: - Actions

    private func setFab(_ open: Bool) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        withAnimation(reduceMotion ? nil : Theme2.Motion.spring) { fabOpen = open }
    }

    private func go(_ mode: AddMealViewModel.Mode) {
        setFab(false)
        // The speed dial IS the chooser — each action lands straight on its
        // destination, no intermediate "Log a meal" screen (DESIGN §4.4 "no
        // chooser screen"). Camera is its own full-screen capture flow.
        if mode == .camera { cameraOpen = true } else { addMode = mode }
    }

    private func routeFor(_ tab: Tab) -> Route {
        switch tab {
        case .today: .today
        case .history: .history
        case .weight: .weight
        case .settings: .settings
        }
    }
}

#Preview {
    @Previewable @State var route: Route = .today
    RootView(route: $route)
}
