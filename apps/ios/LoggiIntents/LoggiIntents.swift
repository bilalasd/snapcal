import AppIntents
import Foundation

// Zero-second camera: Action Button, Spotlight, and Siri jump straight into
// capture. Logging speed is retention — this owns pocket-to-viewfinder time.
// Both intents just deep-link; the add screen's `intent` param does the rest.

// ExtensionKit extensions are standalone executables — without an @main the
// binary has no __swift5_entry section and iOS refuses to install the app.
// Deliberately NOT @available-gated: AppIntentsExtension is iOS 17+, so this
// stays valid even if tooling resets the target floor from 18.0 back to 17.0.
@main
struct LoggiIntentsExtension: AppIntentsExtension {}

// OpenURLIntent is iOS 18+; the target floor stays 17.0 (bacons hardcodes it),
// so gate everything on 18 — below that the extension ships empty.
@available(iOS 18.0, *)
struct LogMealIntent: AppIntent {
  static var title: LocalizedStringResource = "Log a Meal"
  static var description = IntentDescription(
    "Open Loggi straight into the camera — food, label, or barcode."
  )
  static var openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: "loggi://add")!))
  }
}

@available(iOS 18.0, *)
struct SpeakMealIntent: AppIntent {
  static var title: LocalizedStringResource = "Speak a Meal"
  static var description = IntentDescription(
    "Open Loggi ready to hear what you ate."
  )
  static var openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: "loggi://add?intent=speak")!))
  }
}

@available(iOS 18.0, *)
struct LoggiShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: LogMealIntent(),
      phrases: [
        "Log a meal with \(.applicationName)",
        "Log food in \(.applicationName)",
        "\(.applicationName) camera",
      ],
      shortTitle: "Log a meal",
      systemImageName: "camera.fill"
    )
    AppShortcut(
      intent: SpeakMealIntent(),
      phrases: [
        "Tell \(.applicationName) what I ate",
        "Speak a meal to \(.applicationName)",
      ],
      shortTitle: "Speak a meal",
      systemImageName: "mic.fill"
    )
  }
}
