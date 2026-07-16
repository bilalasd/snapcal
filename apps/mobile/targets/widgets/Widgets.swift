import WidgetKit
import SwiftUI

private let appGroup = "group.com.loggi.app"
// Loggi design tokens — lime hero card with black ink (see DESIGN.md).
private let lime = Color(red: 220 / 255, green: 238 / 255, blue: 177 / 255)
private let over = Color(red: 217 / 255, green: 45 / 255, blue: 32 / 255)
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

@main
struct LoggiWidgets: WidgetBundle {
  var body: some Widget {
    ProgressWidget()
    QuickLogWidget()
  }
}
