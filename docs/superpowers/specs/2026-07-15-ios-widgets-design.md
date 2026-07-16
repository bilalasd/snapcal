# iOS Widgets — Design

**Date:** 2026-07-15
**Scope:** iOS only (Android later if ever). Expo prebuild (CNG) project — `ios/` is gitignored, so everything must be declared in config, not hand-edited in Xcode.

## Goal

Home-screen and lock-screen widgets for Loggi:

1. **Today's progress** — `systemSmall`: calories eaten vs goal as a ring. `systemMedium`: ring plus protein/carbs/fat bars. Tap opens the app (`loggi://`).
2. **Quick-log** — `systemSmall` camera button; `widgetURL` deep links to `loggi://add`.
3. **Lock screen** — `accessoryCircular` (mini calories ring) and `accessoryInline` ("1,450 kcal left").

Explicitly out of scope: streak/Bevi widget, Android widgets, Live Activities, interactive (iOS 17 AppIntent) widgets — plain deep links cover the need.

## Approach

`@bacons/apple-targets` config plugin. The widget extension is Swift source in `apps/mobile/targets/widgets/` with an `expo-target.config.js`; the plugin generates the Xcode target on every `expo prebuild`, so it survives CNG.

Rejected:
- Manual Xcode target — wiped by prebuild.
- `react-native-widget-extension` and similar wrappers — unmaintained, less control.

## Data flow

- **App Group:** `group.com.loggi.app`, added to both the app and widget entitlements.
- **Bridge:** a tiny local Expo module (Swift, ~30 lines) exposing `setWidgetData(json: string)` — writes the JSON to the App Group's shared `UserDefaults` and calls `WidgetCenter.shared.reloadAllTimelines()`.
- **Payload:** `{ date: "YYYY-MM-DD" (device-local), calories, caloriesGoal, protein, proteinGoal, carbs, carbsGoal, fat, fatGoal }`.
- **Write points (RN side):** after any meal add/edit/delete in `apps/mobile/lib/meal-actions.ts`, and when goals load/refresh (`lib/cache.ts` setter). No new server or API work — the widget only ever knows today's totals.
- **Staleness:** the widget compares the stored `date` to the current day. Mismatch → render 0 / goal. A midnight timeline entry handles rollover without the app opening.
- **No data yet** (fresh install, never opened app): widget shows a "Open Loggi to get started" placeholder.

## Components

| Unit | Location | Responsibility |
|------|----------|----------------|
| Widget extension | `apps/mobile/targets/widgets/` (Swift) | Timeline provider reads shared defaults; three widget views; midnight rollover entry |
| WidgetBridge module | `apps/mobile/modules/widget-bridge/` (local Expo module) | `setWidgetData(json)` → shared defaults + reload timelines; no-op on Android |
| RN write points | `lib/meal-actions.ts`, `lib/cache.ts` | Compute today's totals + goals, call `setWidgetData` |
| Config | `app.json` / `expo-target.config.js` | App Group entitlement on app + widget targets |

## Error handling

- Bridge unavailable (Android, Expo Go): calls are wrapped and silently no-op.
- Malformed/missing JSON in shared defaults: widget falls back to placeholder state.

## Testing

- TypeScript: `tsc` passes; RN-side totals computation gets a small runnable check.
- `expo prebuild` + iOS build compile cleanly.
- Visual/on-device verification requires a dev build (widgets don't run in Expo Go) — done by hand on device.
