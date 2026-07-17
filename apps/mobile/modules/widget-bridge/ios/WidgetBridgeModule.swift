import ActivityKit
import ExpoModulesCore
import WidgetKit

// Must stay byte-compatible with the copy in Widgets.swift — ActivityKit
// matches attributes across targets by type name + encoding.
struct DinnerActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var reservedKcal: Int
    var remainingKcal: Int
  }
  var label: String
}

@available(iOS 16.2, *)
private enum DinnerActivity {
  static var current: Activity<DinnerActivityAttributes>?

  static func start(label: String, reserved: Int, remaining: Int) {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
    let state = DinnerActivityAttributes.ContentState(
      reservedKcal: reserved, remainingKcal: remaining)
    if let activity = current ?? Activity<DinnerActivityAttributes>.activities.first {
      current = activity
      Task { await activity.update(ActivityContent(state: state, staleDate: nil)) }
      return
    }
    current = try? Activity.request(
      attributes: DinnerActivityAttributes(label: label),
      content: ActivityContent(state: state, staleDate: nil))
  }

  static func end() {
    let activities = Activity<DinnerActivityAttributes>.activities
    current = nil
    Task {
      for activity in activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}

public class WidgetBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    Function("setWidgetData") { (json: String) in
      UserDefaults(suiteName: "group.com.loggi.app")?.set(json, forKey: "widgetData")
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    Function("startDinnerActivity") { (label: String, reserved: Int, remaining: Int) in
      if #available(iOS 16.2, *) {
        DinnerActivity.start(label: label, reserved: reserved, remaining: remaining)
      }
    }

    Function("endDinnerActivity") {
      if #available(iOS 16.2, *) {
        DinnerActivity.end()
      }
    }
  }
}
