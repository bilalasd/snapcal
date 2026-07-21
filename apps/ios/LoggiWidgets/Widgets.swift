import ActivityKit
import WidgetKit
import SwiftUI

private let appGroup = "group.com.loggi.app"
// Loggi design tokens, duplicated deliberately: the widget extension doesn't
// link the app's Theme2, and these must stay in sync with it by hand.
// Lime block + fixed near-black ink (the pastel never inverts), and the
// light-mode over-target crimson — a widget can't resolve a dynamic colour
// against the app's canvas, so the FIXED values are the correct choice here.
private let lime = Color(red: 220 / 255, green: 238 / 255, blue: 177 / 255)   // Theme2.Block.lime
private let over = Color(red: 165 / 255, green: 0 / 255, blue: 60 / 255)      // Theme2.statusOver (light)
private let ink = Color(red: 26 / 255, green: 22 / 255, blue: 19 / 255)       // Theme2.blockInk
private let track = Color.black.opacity(0.12)

struct WidgetData: Codable {
  var date: String
  var calories: Double
  var caloriesGoal: Double
  var protein: Double
  var proteinGoal: Double
  var carbs: Double
  var carbsGoal: Double
  var fat: Double
  var fatGoal: Double
}

private func todayString() -> String {
  let fmt = DateFormatter()
  fmt.locale = Locale(identifier: "en_US_POSIX")
  fmt.dateFormat = "yyyy-MM-dd"
  return fmt.string(from: Date())
}

/// nil = app never wrote data (fresh install). A stale date renders as a fresh
/// day: zero eaten, goals kept.
private func loadData() -> WidgetData? {
  guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: "widgetData"),
        let raw = json.data(using: .utf8),
        var data = try? JSONDecoder().decode(WidgetData.self, from: raw)
  else { return nil }
  if data.date != todayString() {
    data.calories = 0
    data.protein = 0
    data.carbs = 0
    data.fat = 0
  }
  return data
}

struct Entry: TimelineEntry {
  let date: Date
  let data: WidgetData?
}

struct Provider: TimelineProvider {
  private let sample = WidgetData(
    date: "", calories: 1240, caloriesGoal: 2200, protein: 82, proteinGoal: 140,
    carbs: 118, carbsGoal: 220, fat: 41, fatGoal: 70)

  func placeholder(in context: Context) -> Entry {
    Entry(date: Date(), data: sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    completion(Entry(date: Date(), data: loadData() ?? sample))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    // One entry now; wake at midnight so yesterday's numbers roll to zero even
    // if the app never opens.
    let midnight = Calendar.current.startOfDay(
      for: Calendar.current.date(byAdding: .day, value: 1, to: Date())!)
    completion(Timeline(entries: [Entry(date: Date(), data: loadData())], policy: .after(midnight)))
  }
}

// MARK: - Shared views

struct Ring: View {
  var value: Double
  var goal: Double
  var lineWidth: CGFloat = 10

  var body: some View {
    let fraction = goal > 0 ? min(value / goal, 1) : 0
    ZStack {
      Circle().stroke(track, lineWidth: lineWidth)
      Circle()
        .trim(from: 0, to: fraction)
        .stroke(
          value > goal ? over : Color.black,
          style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
        )
        .rotationEffect(.degrees(-90))
    }
  }
}

struct MacroBar: View {
  var label: String
  var value: Double
  var goal: Double
  var ink: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text("\(label) \(Int(value))/\(Int(goal))g")
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(.black.opacity(0.7))
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule().fill(track)
          Capsule()
            .fill(ink)
            .frame(width: geo.size.width * (goal > 0 ? min(value / goal, 1) : 0))
        }
      }
      .frame(height: 5)
    }
  }
}

struct EmptyState: View {
  var body: some View {
    VStack(spacing: 4) {
      Text("Loggi").font(.system(size: 14, weight: .black))
      Text("Open the app to get started")
        .font(.system(size: 11))
        .foregroundStyle(.black.opacity(0.6))
        .multilineTextAlignment(.center)
    }
  }
}

// MARK: - Progress widget

struct ProgressWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: Entry

  var body: some View {
    Group {
      if let d = entry.data {
        switch family {
        case .accessoryCircular:
          Gauge(value: min(d.calories, d.caloriesGoal), in: 0...max(d.caloriesGoal, 1)) {
            Text("cal")
          } currentValueLabel: {
            Text("\(Int(d.calories))").font(.system(size: 14, weight: .bold))
          }
          .gaugeStyle(.accessoryCircularCapacity)
        case .accessoryInline:
          let left = Int(d.caloriesGoal - d.calories)
          Text(left >= 0 ? "\(left) kcal left" : "\(-left) kcal over")
        case .systemMedium:
          HStack(spacing: 16) {
            smallContent(d).frame(maxWidth: .infinity)
            VStack(spacing: 8) {
              MacroBar(label: "Protein", value: d.protein, goal: d.proteinGoal, ink: .black)
              MacroBar(label: "Carbs", value: d.carbs, goal: d.carbsGoal, ink: .black.opacity(0.7))
              MacroBar(label: "Fat", value: d.fat, goal: d.fatGoal, ink: .black.opacity(0.5))
            }
            .frame(maxWidth: .infinity)
          }
        default:
          smallContent(d)
        }
      } else {
        EmptyState()
      }
    }
    .containerBackground(for: .widget) {
      if family == .accessoryCircular || family == .accessoryInline {
        Color.clear
      } else {
        lime
      }
    }
  }

  private func smallContent(_ d: WidgetData) -> some View {
    ZStack {
      Ring(value: d.calories, goal: d.caloriesGoal)
      VStack(spacing: 0) {
        Text("\(Int(d.calories))")
          .font(.system(size: 22, weight: .black))
          .foregroundStyle(d.calories > d.caloriesGoal ? over : Color.black)
          .minimumScaleFactor(0.6)
        Text("of \(Int(d.caloriesGoal))")
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(.black.opacity(0.6))
      }
      .padding(14)
    }
    .padding(2)
  }
}

struct ProgressWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "LoggiProgress", provider: Provider()) { entry in
      ProgressWidgetView(entry: entry)
    }
    .configurationDisplayName("Today's progress")
    .description("Calories and macros for today.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryInline])
  }
}

// MARK: - Quick-log widget

struct QuickLogWidgetView: View {
  let entry: Entry

  var body: some View {
    VStack(spacing: 8) {
      Image(systemName: "camera.fill")
        .font(.system(size: 28, weight: .bold))
        .foregroundStyle(.black)
      Text("Log a meal")
        .font(.system(size: 13, weight: .black))
        .foregroundStyle(.black)
    }
    .containerBackground(for: .widget) { lime }
    .widgetURL(URL(string: "loggi://add"))
  }
}

struct QuickLogWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "LoggiQuickLog", provider: Provider()) { entry in
      QuickLogWidgetView(entry: entry)
    }
    .configurationDisplayName("Quick log")
    .description("Jump straight to logging a meal.")
    .supportedFamilies([.systemSmall])
  }
}

// MARK: - Dinner-out Live Activity

// Must stay byte-compatible with the copy in WidgetBridgeModule.swift —
// ActivityKit matches attributes across targets by type name + encoding.
struct DinnerActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var reservedKcal: Int
    var remainingKcal: Int
  }
  var label: String
}

private let lilac = Color(red: 197 / 255, green: 176 / 255, blue: 244 / 255)

struct DinnerActivityView: View {
  let context: ActivityViewContext<DinnerActivityAttributes>

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text("DINNER OUT · \(context.attributes.label.uppercased())")
          .font(.system(size: 10, weight: .heavy))
          .tracking(1)
          .foregroundStyle(.black.opacity(0.6))
          .lineLimit(1)
        Text("\(context.state.reservedKcal) cal reserved")
          .font(.system(size: 22, weight: .black))
          .foregroundStyle(.black)
        Text("\(max(0, context.state.remainingKcal)) cal still available after")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(.black.opacity(0.7))
      }
      Spacer()
      Image(systemName: "fork.knife")
        .font(.system(size: 24, weight: .bold))
        .foregroundStyle(.black)
    }
    .padding(16)
    .activityBackgroundTint(lilac)
    .activitySystemActionForegroundColor(.black)
  }
}

struct DinnerActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: DinnerActivityAttributes.self) { context in
      DinnerActivityView(context: context)
        .widgetURL(URL(string: "loggi://"))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text("DINNER OUT")
            .font(.system(size: 10, weight: .heavy))
            .tracking(1)
            .foregroundStyle(.secondary)
        }
        DynamicIslandExpandedRegion(.center) {
          Text("\(context.state.reservedKcal) cal reserved")
            .font(.system(size: 18, weight: .black))
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text("\(max(0, context.state.remainingKcal)) cal still available after")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.secondary)
        }
      } compactLeading: {
        Image(systemName: "fork.knife")
      } compactTrailing: {
        Text("\(context.state.reservedKcal)")
          .font(.system(size: 13, weight: .black))
      } minimal: {
        Image(systemName: "fork.knife")
      }
    }
  }
}

@main
struct LoggiWidgets: WidgetBundle {
  var body: some Widget {
    ProgressWidget()
    QuickLogWidget()
    if #available(iOS 16.2, *) {
      DinnerActivityWidget()
    }
  }
}
