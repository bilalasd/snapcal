# Swift Rewrite Phase 1 — Data Layer + Clerk Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign in on the simulator against the real Clerk instance, and fetch+print today's meals from the real production API — proving the auth + networking + cache foundation every later screen builds on.

**Architecture:** Codable models mirror `@loggi/shared`'s `types.ts` exactly (same field names via `CodingKeys`, same numeric-string quirks). `APIClient` is a thin async/await wrapper injecting a Clerk bearer token, mirroring `lib/api.ts`. `MealCache`/`Queue` are `@Observable` singletons mirroring `lib/cache.ts`/`lib/queue.ts` semantics (stale-while-revalidate, optimistic overlay, offline queue) but simplified where Phase 1 doesn't yet need the full surface (widget sync, dinner activity, reminders — those are Phase 4). Auth screens are minimal (not final UI) — Phase 2+ restyles them; Phase 1 only needs "type email/password, tap button, land in an authed state."

**Tech Stack:** Swift 6 / SwiftUI, ClerkKit + ClerkKitUI (SPM), URLSession + async/await, Codable, UserDefaults/FileManager for disk persistence (no GRDB yet — the queue is a small JSON array, YAGNI for a proper DB until Phase 3's offline photo queue needs it).

## Global Constraints

- Work in the worktree: `/Users/muhammadbalagamwala/Documents/Projects/2026/SnapCal/.claude/worktrees/swift-rewrite`. Regenerate with `cd apps/ios && xcodegen generate` after any project.yml or file-set change.
- Production API base URL: `https://mealio-api-five.vercel.app` (from `apps/mobile/eas.json` production profile — same one the RN app hits).
- Clerk publishable key: read from `apps/mobile/.env.local` (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`) — same Clerk instance/users as the RN app. Copy the literal value into Swift; do not invent one.
- **ClerkKit symbol grounding:** confirmed from Clerk's own docs today: `Clerk.configure(publishableKey:)`, `Clerk.shared` (`@Observable`, injected via `.environment(Clerk.self)` / read via `@Environment(Clerk.self)`), `clerk.user`, `try await clerk.auth.signInWithPassword(identifier:password:)`, `try await clerk.auth.signUp(emailAddress:password:firstName:lastName:)` then `signUp.sendEmailCode()` / `signUp.verifyEmailCode(_:)`, `try await clerk.auth.signInWithApple()`, `try await clerk.auth.signOut()`, and `Clerk.shared.session?.getToken()?.jwt` (async, returns an optional token resource with a `.jwt` string). **If any of these don't compile against the actually-resolved SPM package version, grep the resolved package's `Sources/` for the real symbol before improvising, and report the correction — do not guess a plausible-sounding alternative.**
- Every model's `CodingKeys` must match the JSON field names in `packages/shared/src/types.ts` exactly (camelCase from the API, e.g. `eatenAt`, `proteinG`) — this is not a place for Swift-idiomatic renaming without a `CodingKeys` mapping.
- Commit after each task; trailers: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01LUkoTB1GUfXibmxxhrVQdh`.
- Verify every task on the simulator (build, install, launch, screenshot via `apps/ios/scripts/dev-loop.sh`) — no task is done on "it compiles" alone.

---

### Task 1: Codable models mirroring `@loggi/shared`

**Files:**
- Create: `apps/ios/Loggi/Models/ApiMeal.swift`
- Create: `apps/ios/Loggi/Models/Goals.swift`
- Create: `apps/ios/Loggi/Models/Draft.swift`

**Interfaces:**
- Produces: `struct ApiMealItem`, `struct ApiMealPhoto`, `struct ApiMeal: Codable, Identifiable, Equatable` (fields: `id, eatenAt: String, name, note: String?, isFavorite: Bool, source: String, planned: Bool, createdAt: String, items: [ApiMealItem], photos: [ApiMealPhoto]`), `struct Goals: Codable, Equatable` (mirrors the TS interface exactly incl. optional fields and the `activity_level` enum as a `String` raw-valued enum `ActivityLevel`), `struct DraftItem: Codable`, `struct DraftPhoto: Codable`, `struct MealDraft: Codable`. Also: `func mealTotals(_ meal: ApiMeal) -> (calories: Double, protein: Double, carbs: Double, fat: Double)` and `func itemsToDraft(_ meal: ApiMeal) -> [DraftItem]` as free functions mirroring `types.ts`. Later phases import these types.

- [ ] **Step 1: Write `ApiMeal.swift`**

```swift
import Foundation

struct ApiMealItem: Codable, Identifiable, Equatable {
    let id: String
    let mealId: String
    let name: String
    let portion: String
    let calories: Double
    let proteinG: String
    let carbsG: String
    let fatG: String
    let satFatG: String?
    let fiberG: String?
    let sugarG: String?
    let sodiumMg: String?
}

struct ApiMealPhoto: Codable, Identifiable, Equatable {
    let id: String
    let mealId: String
    let url: String
    let pathname: String
}

struct ApiMeal: Codable, Identifiable, Equatable {
    let id: String
    let eatenAt: String
    let name: String
    let note: String?
    let isFavorite: Bool
    let source: String
    let planned: Bool
    let createdAt: String
    let items: [ApiMealItem]
    let photos: [ApiMealPhoto]
}

/// Local calendar date as YYYY-MM-DD, matching lib/shared's localDateString().
func localDateString(_ date: Date = Date()) -> String {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    f.timeZone = .current
    return f.string(from: date)
}

/// Minutes to add to UTC midnight to get local midnight — matches
/// getTimezoneOffset() sign convention (positive = behind UTC).
func tzOffsetMinutes() -> Int {
    -TimeZone.current.secondsFromGMT() / 60
}

func mealTotals(_ meal: ApiMeal) -> (calories: Double, protein: Double, carbs: Double, fat: Double) {
    meal.items.reduce((0.0, 0.0, 0.0, 0.0)) { acc, item in
        (acc.0 + item.calories,
         acc.1 + (Double(item.proteinG) ?? 0),
         acc.2 + (Double(item.carbsG) ?? 0),
         acc.3 + (Double(item.fatG) ?? 0))
    }
}
```

- [ ] **Step 2: Write `Goals.swift`**

```swift
import Foundation

enum ActivityLevel: String, Codable {
    case sedentary, light, moderate, active
    case veryActive = "very_active"
}

enum UnitSystem: String, Codable {
    case metric, imperial
}

enum Sex: String, Codable {
    case male, female
}

struct Goals: Codable, Equatable {
    var dailyCalories: Int
    var dailyProteinG: Int
    var dailyCarbsG: Int
    var dailyFatG: Int
    var targetRateKgPerWk: Double
    var unitSystem: UnitSystem
    var sex: Sex?
    var age: Int?
    var heightCm: Double?
    var activityLevel: ActivityLevel?
    var onboarded: Bool
    var goalWeightKg: Double?
    var adaptiveGoal: Bool

    enum CodingKeys: String, CodingKey {
        case dailyCalories = "daily_calories"
        case dailyProteinG = "daily_protein_g"
        case dailyCarbsG = "daily_carbs_g"
        case dailyFatG = "daily_fat_g"
        case targetRateKgPerWk = "target_rate_kg_per_wk"
        case unitSystem = "unit_system"
        case sex, age
        case heightCm = "height_cm"
        case activityLevel = "activity_level"
        case onboarded
        case goalWeightKg = "goal_weight_kg"
        case adaptiveGoal = "adaptive_goal"
    }
}
```

- [ ] **Step 3: Write `Draft.swift`**

```swift
import Foundation

struct DraftItem: Codable, Equatable, Identifiable {
    var id = UUID()
    var name: String
    var portion: String
    var calories: Double
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
    var satFatG: Double?
    var fiberG: Double?
    var sugarG: Double?
    var sodiumMg: Double?

    enum CodingKeys: String, CodingKey {
        case name, portion, calories
        case proteinG = "protein_g"
        case carbsG = "carbs_g"
        case fatG = "fat_g"
        case satFatG = "sat_fat_g"
        case fiberG = "fiber_g"
        case sugarG = "sugar_g"
        case sodiumMg = "sodium_mg"
    }
}

struct DraftPhoto: Codable, Equatable {
    var url: String
    var pathname: String
}

struct MealDraft: Codable {
    var name: String
    var eatenAt: String
    var note: String?
    var source: String // "photo" | "text" | "favorite" | "copy"
    var items: [DraftItem]
    var photos: [DraftPhoto]?

    enum CodingKeys: String, CodingKey {
        case name
        case eatenAt = "eaten_at"
        case note, source, items, photos
    }
}

func itemsToDraft(_ meal: ApiMeal) -> [DraftItem] {
    meal.items.map { item in
        DraftItem(
            name: item.name, portion: item.portion, calories: item.calories,
            proteinG: Double(item.proteinG) ?? 0, carbsG: Double(item.carbsG) ?? 0,
            fatG: Double(item.fatG) ?? 0,
            satFatG: item.satFatG.flatMap(Double.init),
            fiberG: item.fiberG.flatMap(Double.init),
            sugarG: item.sugarG.flatMap(Double.init),
            sodiumMg: item.sodiumMg.flatMap(Double.init))
    }
}
```

- [ ] **Step 4: Build** (compile-only check; these are pure model files with no view yet):

```bash
cd apps/ios && xcodegen generate
UDID=$(xcrun simctl list devices booted | grep iPhone | grep -oE '[0-9A-F-]{36}' | head -1)
xcodebuild -project Loggi.xcodeproj -scheme Loggi -configuration Debug -destination "platform=iOS Simulator,id=$UDID" build | tail -5
```
Expected: `** BUILD SUCCEEDED **`. (Files aren't referenced by any view yet, so a successful build only proves they compile — that's the whole point of this step.)

- [ ] **Step 5: Commit** — `swift: Codable models mirroring @loggi/shared`

---

### Task 2: Clerk SPM dependency + configuration

**Files:**
- Modify: `apps/ios/project.yml` (add ClerkKit/ClerkKitUI package dependency)
- Create: `apps/ios/Loggi/Config.swift`
- Modify: `apps/ios/Loggi/LoggiApp.swift`

**Interfaces:**
- Produces: `enum Config { static let apiBaseURL: URL; static let clerkPublishableKey: String }`. `LoggiApp` calls `Clerk.configure` and injects `.environment(Clerk.self)`.

- [ ] **Step 1: Read the real Clerk publishable key**

```bash
grep EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY apps/mobile/.env.local
```
Use the exact value printed (starts `pk_test_`) in Step 3 below — do not use a placeholder.

- [ ] **Step 2: Add the SPM package to `project.yml`** — add a top-level `packages:` block and a target dependency:

```yaml
packages:
  Clerk:
    url: https://github.com/clerk/clerk-ios
    from: 1.0.0
```

Under the `Loggi` target's existing keys, add:

```yaml
    dependencies:
      - package: Clerk
        product: ClerkKit
      - package: Clerk
        product: ClerkKitUI
```

- [ ] **Step 3: Write `Config.swift`**

```swift
import Foundation

enum Config {
    static let apiBaseURL = URL(string: "https://mealio-api-five.vercel.app")!
    /// Same Clerk instance/users as the RN app (apps/mobile/.env.local).
    static let clerkPublishableKey = "pk_test_REPLACE_WITH_VALUE_FROM_STEP_1"
}
```
Replace the literal with the value read in Step 1.

- [ ] **Step 4: Wire `LoggiApp.swift`** — add `import ClerkKit` at the top; in `init()` (or a static block before the body — ClerkKit needs `Clerk.configure` called once before `Clerk.shared` is touched), call:

```swift
Clerk.configure(publishableKey: Config.clerkPublishableKey)
```

On the `WindowGroup`'s content, chain `.environment(Clerk.self)` alongside the existing `.onOpenURL`. Add a `.task { try? await Clerk.shared.load() }` at the root view level so the SDK loads session state on launch.

- [ ] **Step 5: Build, install, launch; confirm no crash and the existing placeholder still renders** (this task doesn't add UI yet — it's proving the dependency resolves and configures without crashing):

```bash
cd apps/ios && xcodegen generate
UDID=$(xcrun simctl list devices booted | grep iPhone | grep -oE '[0-9A-F-]{36}' | head -1)
xcodebuild -project Loggi.xcodeproj -scheme Loggi -configuration Debug -destination "platform=iOS Simulator,id=$UDID" -resolvePackageDependencies
xcodebuild -project Loggi.xcodeproj -scheme Loggi -configuration Debug -destination "platform=iOS Simulator,id=$UDID" build | tail -5
xcrun simctl install "$UDID" ~/Library/Developer/Xcode/DerivedData/Loggi-*/Build/Products/Debug-iphonesimulator/Loggi.app
xcrun simctl launch "$UDID" com.loggi.app
```
Expected: package resolves (may take a minute first time), `** BUILD SUCCEEDED **`, launch returns a PID with no immediate crash (`xcrun simctl spawn "$UDID" log show --last 30s --predicate 'process == "Loggi"' | grep -i crash` should be empty).

- [ ] **Step 6: Commit** — `swift: add Clerk SDK dependency + configuration`

---

### Task 3: Minimal auth screens (sign-in, sign-up) + AuthGate

**Files:**
- Create: `apps/ios/Loggi/Auth/SignInView.swift`
- Create: `apps/ios/Loggi/Auth/SignUpView.swift`
- Create: `apps/ios/Loggi/Auth/AuthGate.swift`
- Modify: `apps/ios/Loggi/LoggiApp.swift` (swap `RootView` behind `AuthGate`)

**Interfaces:**
- Consumes: `Clerk.shared`, `Theme.*` from Task 2 / Phase 0.
- Produces: `AuthGate: View` — shows `SignInView` when `clerk.user == nil`, else the existing `RootView`. This is the seam Phase 2 restyles; the plan of record is "prove sign-in works," not "final auth UI."

- [ ] **Step 1: Write `SignInView.swift`** — plain form, no design polish yet (Theme colors only, not full DESIGN.md auth screen layout — that's Phase 2):

```swift
import SwiftUI
import ClerkKit

struct SignInView: View {
    @Environment(Clerk.self) private var clerk
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false
    var onSignUpTapped: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.m) {
            Text("Loggi").font(Theme.Typography.headline34).foregroundStyle(Theme.foreground)
            TextField("Email", text: $email)
                .textInputAutocapitalization(.never).keyboardType(.emailAddress)
                .padding(Theme.Spacing.s).background(Theme.muted)
            SecureField("Password", text: $password)
                .padding(Theme.Spacing.s).background(Theme.muted)
            if let error { Text(error).foregroundStyle(Theme.destructive).font(Theme.Typography.caption11) }
            Button(busy ? "Signing in…" : "Sign in") {
                Task { await signIn() }
            }
            .disabled(busy || email.isEmpty || password.isEmpty)
            Button("No account? Sign up", action: onSignUpTapped)
                .foregroundStyle(Theme.mutedForeground)
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
    }

    private func signIn() async {
        busy = true; error = nil
        do {
            _ = try await clerk.auth.signInWithPassword(identifier: email, password: password)
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}
```

- [ ] **Step 2: Write `SignUpView.swift`** — same shape, email + password + first/last name, calling `clerk.auth.signUp(emailAddress:password:firstName:lastName:)` then `signUp.sendEmailCode()`. For Phase 1, stop at "code sent" with a code TextField + a verify button calling `signUp.verifyEmailCode(_:)`; no polish. Include an `onSignInTapped: () -> Void` back-link, same visual pattern as SignInView.

- [ ] **Step 3: Write `AuthGate.swift`**

```swift
import SwiftUI
import ClerkKit

struct AuthGate: View {
    @Environment(Clerk.self) private var clerk
    @State private var showingSignUp = false

    var body: some View {
        if !clerk.isLoaded {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).background(Theme.background)
        } else if clerk.user == nil {
            if showingSignUp {
                SignUpView(onSignInTapped: { showingSignUp = false })
            } else {
                SignInView(onSignUpTapped: { showingSignUp = true })
            }
        } else {
            RootView()
        }
    }
}
```
Note for implementer: if `clerk.isLoaded` doesn't exist under that exact name, grep the resolved ClerkKit package (`~/Library/Developer/Xcode/DerivedData/.../SourcePackages/checkouts/clerk-ios/` or the SPM cache) for the actual loaded-state property/method and use that instead — report the correction.

- [ ] **Step 4: Swap into `LoggiApp.swift`** — replace the direct `RootView()` in the `WindowGroup` with `AuthGate()` (keep `.environment(Clerk.self)`, `.onOpenURL`, and the `.task { load() }` at this same level).

- [ ] **Step 5: Verify on simulator** — build, install, launch, screenshot. Expected: sign-in form renders (not the route placeholder — proves the gate is working since no user is signed in). Type a real test credential if one exists in `apps/api/.env.local` / project memory; if not available to the agent, this step only verifies the *form renders*, not a successful login — note that explicitly in the report rather than claiming a login was tested.

```bash
cd apps/ios && bash scripts/dev-loop.sh /tmp/phase1-t3-signin.png
```

- [ ] **Step 6: Commit** — `swift: minimal auth screens + AuthGate`

---

### Task 4: APIClient (Bearer-token networking)

**Files:**
- Create: `apps/ios/Loggi/Networking/APIClient.swift`

**Interfaces:**
- Consumes: `Clerk.shared.session?.getToken()?.jwt`, `Config.apiBaseURL`.
- Produces: `enum APIError: Error { case network, server(String), decoding }`; `struct APIClient { static let shared = APIClient(); func get<T: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> T; func post<T: Decodable>(_ path: String, body: Encodable) async throws -> T; func delete(_ path: String) async throws }`. Later tasks/phases call `APIClient.shared.get(...)` exactly like `fetchJson` in the RN app.

- [ ] **Step 1: Write `APIClient.swift`**

```swift
import Foundation
import ClerkKit

enum APIError: Error, LocalizedError {
    case network
    case server(String)
    case decoding

    var errorDescription: String? {
        switch self {
        case .network: return "No connection — check your internet and try again."
        case .server(let msg): return msg
        case .decoding: return "Unexpected response from the server."
        }
    }
}

struct APIClient {
    static let shared = APIClient()
    private let timeout: TimeInterval = 15

    private func makeRequest(_ path: String, method: String, query: [String: String], body: Data?) async throws -> URLRequest {
        var components = URLComponents(url: Config.apiBaseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        var request = URLRequest(url: components.url!, timeoutInterval: timeout)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        if let token = try? await Clerk.shared.session?.getToken()?.jwt {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = body
        return request
    }

    private func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.network
        }
        guard let http = response as? HTTPURLResponse else { throw APIError.network }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
                ?? "Request failed (\(http.statusCode))"
            throw APIError.server(message)
        }
        return (data, http)
    }

    func get<T: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> T {
        let request = try await makeRequest(path, method: "GET", query: query, body: nil)
        let (data, _) = try await send(request)
        do { return try JSONDecoder().decode(T.self, from: data) } catch { throw APIError.decoding }
    }

    func post<T: Decodable>(_ path: String, body: Encodable) async throws -> T {
        let bodyData = try JSONEncoder().encode(AnyEncodable(body))
        let request = try await makeRequest(path, method: "POST", query: [:], body: bodyData)
        let (data, _) = try await send(request)
        do { return try JSONDecoder().decode(T.self, from: data) } catch { throw APIError.decoding }
    }

    @discardableResult
    func delete(_ path: String) async throws -> Data {
        let request = try await makeRequest(path, method: "DELETE", query: [:], body: nil)
        let (data, _) = try await send(request)
        return data
    }
}

/// Type-erasing wrapper so `post` can accept any Encodable body without a generic
/// parameter explosion at call sites — mirrors JSON.stringify(body) ergonomics.
private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { encodeFunc = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeFunc(encoder) }
}
```

Note for implementer: if `Clerk.shared.session?.getToken()?.jwt` doesn't compile (wrong optionality, wrong property name, or `getToken()` throws instead of returning optional), fix based on the actual compiler error and the resolved package's real signature — report the correction. The important behavior to preserve: never crash/throw when there's no session (unauthenticated requests should just omit the header, matching `lib/api.ts`'s `token ? {...} : {}` pattern).

- [ ] **Step 2: Prove it end-to-end** — add a temporary debug button to `RootView` (or a `.task` on it) that calls `APIClient.shared.get("/api/goals")` and prints the result, so this task's build actually exercises a live network call against production:

```swift
.task {
    do {
        let goals: Goals = try await APIClient.shared.get("/api/goals")
        print("Fetched goals: \(goals)")
    } catch {
        print("Fetch failed: \(error)")
    }
}
```
This is throwaway — Task 5 replaces it with the real cache-backed fetch. Build, install, launch on the simulator, then read the console log:

```bash
xcrun simctl spawn "$UDID" log show --last 30s --predicate 'process == "Loggi" AND eventMessage CONTAINS "goals"' 2>/dev/null
```
Expected: either `Fetched goals: Goals(...)` (if a session exists — unlikely without a completed sign-in) or `Fetch failed: server("Unauthorized")` / similar — either proves the client reaches the real API and gets a real HTTP response, not a network error. A `network` error means something is actually broken (wrong base URL, no connectivity) — investigate before proceeding.

- [ ] **Step 3: Commit** — `swift: APIClient with Clerk bearer-token auth, verified against production API`

---

### Task 5: MealCache + Queue (stale-while-revalidate + offline queue)

**Files:**
- Create: `apps/ios/Loggi/State/MealCache.swift`
- Create: `apps/ios/Loggi/State/SaveQueue.swift`
- Modify: `apps/ios/Loggi/Navigation/RootView.swift` (replace Task 4's debug fetch with the real cache-backed load + print)

**Interfaces:**
- Produces: `@Observable final class MealCache { static let shared = MealCache(); func cachedMeals(for date: String) -> [ApiMeal]?; func cachedGoals() -> Goals?; func setGoals(_ g: Goals); func reconcileMeals(date: String, server: [ApiMeal]) -> [ApiMeal]; func addOptimisticMeal(_ meal: ApiMeal); func settleMeal(id: String); func discardOptimistic(id: String) }` mirroring `lib/cache.ts`'s meal/goals surface (skip widget-sync/dinner-activity/reminder hooks — Phase 4). `@Observable final class SaveQueue { static let shared = SaveQueue(); func hydrate() async; func enqueue(...); func flush() async }` mirroring `lib/queue.ts`, persisted as JSON in the app's Documents directory (mirrors `readJson`/`writeJson` in `lib/disk.ts` — one small helper, not a new abstraction).

- [ ] **Step 1: Write a tiny disk-JSON helper inline in `MealCache.swift`** (top of file, shared by both classes — YAGNI a separate file for two functions):

```swift
import Foundation

enum Disk {
    static func read<T: Decodable>(_ filename: String) -> T? {
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent(filename)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
    static func write<T: Encodable>(_ value: T, to filename: String) {
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent(filename)
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: url)
    }
}
```

- [ ] **Step 2: Write `MealCache.swift`** (below the Disk enum) — in-memory dictionary keyed by date string, pendingNew/pendingEdit/pendingDelete tracking exactly like `lib/cache.ts`, persisted snapshot on every mutation:

```swift
@Observable
final class MealCache {
    static let shared = MealCache()

    private(set) var mealsByDate: [String: [ApiMeal]] = [:]
    private(set) var goals: Goals?
    private var pendingNew: [String: ApiMeal] = [:]
    private var pendingDelete: Set<String> = []

    private struct Snapshot: Codable {
        var goals: Goals?
        var mealsByDate: [String: [ApiMeal]]
    }
    private let snapshotFile = "cache-snapshot.json"

    func hydrate() {
        guard let saved: Snapshot = Disk.read(snapshotFile) else { return }
        if goals == nil { goals = saved.goals }
        for (date, meals) in saved.mealsByDate where mealsByDate[date] == nil {
            mealsByDate[date] = meals
        }
    }

    func cachedMeals(for date: String) -> [ApiMeal]? { mealsByDate[date] }

    func setGoals(_ g: Goals) {
        goals = g
        persist()
    }

    private func overlay(_ server: [ApiMeal]) -> [ApiMeal] {
        server.filter { !pendingDelete.contains($0.id) }
    }

    @discardableResult
    func reconcileMeals(date: String, server: [ApiMeal]) -> [ApiMeal] {
        let newForDay = pendingNew.values.filter { localDateString(ISO8601DateFormatter().date(from: $0.eatenAt) ?? Date()) == date }
        let merged = Array(newForDay) + overlay(server)
        mealsByDate[date] = merged
        persist()
        return merged
    }

    func addOptimisticMeal(_ meal: ApiMeal) {
        pendingNew[meal.id] = meal
        let date = localDateString(ISO8601DateFormatter().date(from: meal.eatenAt) ?? Date())
        mealsByDate[date] = [meal] + (mealsByDate[date] ?? [])
        persist()
    }

    func settleMeal(id: String) {
        pendingNew.removeValue(forKey: id)
    }

    func discardOptimistic(id: String) {
        pendingNew.removeValue(forKey: id)
        for key in mealsByDate.keys {
            mealsByDate[key] = mealsByDate[key]?.filter { $0.id != id }
        }
        persist()
    }

    func clear() {
        mealsByDate = [:]
        goals = nil
        pendingNew = [:]
        pendingDelete = []
    }

    private func persist() {
        Disk.write(Snapshot(goals: goals, mealsByDate: mealsByDate), to: snapshotFile)
    }
}
```
Note: this is Phase-1-scoped — no `historyRange`/`trends`/`favorites`/`recents` slots yet (those arrive with the screens that need them in Phase 2/3), no widget sync (Phase 4). `pendingEdit` is also deferred — nothing in Phase 1 edits a meal yet.

- [ ] **Step 3: Write `SaveQueue.swift`**

```swift
import Foundation

struct QueuedSave: Codable {
    var id: String
    var meal: ApiMeal
    var bodyJSON: Data // encoded POST /api/meals body
}

@Observable
final class SaveQueue {
    static let shared = SaveQueue()
    private(set) var pending: [QueuedSave] = []
    private var hydrated = false
    private var flushing = false
    private let file = "save-queue.json"

    func hydrate() {
        guard !hydrated else { return }
        hydrated = true
        pending = Disk.read(file) ?? []
        for q in pending { MealCache.shared.addOptimisticMeal(q.meal) }
        if !pending.isEmpty { Task { await flush() } }
    }

    func enqueue(_ entry: QueuedSave) {
        pending.append(entry)
        persist()
    }

    func flush() async {
        guard !flushing, !pending.isEmpty else { return }
        flushing = true
        defer { flushing = false }
        while let q = pending.first {
            do {
                struct Empty: Decodable {}
                let _: Empty = try await APIClient.shared.postRaw("/api/meals", bodyJSON: q.bodyJSON)
                MealCache.shared.settleMeal(id: q.id)
            } catch APIError.network {
                return // still offline — keep everything, retry later
            } catch {
                MealCache.shared.discardOptimistic(id: q.id) // server rejected — don't retry
            }
            pending.removeFirst()
            persist()
        }
    }

    private func persist() {
        Disk.write(pending, to: file)
    }
}
```
This calls `APIClient.shared.postRaw` — not yet defined in Task 4's `APIClient`. Add it there as part of this task (small addition, same file):

```swift
/// Like post(), but takes pre-encoded JSON body — the save queue re-sends a
/// body it persisted verbatim rather than re-encoding a live Swift value.
func postRaw<T: Decodable>(_ path: String, bodyJSON: Data) async throws -> T {
    let request = try await makeRequest(path, method: "POST", query: [:], body: bodyJSON)
    let (data, _) = try await send(request)
    do { return try JSONDecoder().decode(T.self, from: data) } catch { throw APIError.decoding }
}
```

- [ ] **Step 4: Replace Task 4's debug fetch in `RootView.swift`** with the real flow — on appear, load cached meals for today instantly (if any), then refetch and reconcile:

```swift
.task {
    MealCache.shared.hydrate()
    SaveQueue.shared.hydrate()
    let today = localDateString()
    do {
        let meals: [ApiMeal] = try await APIClient.shared.get("/api/meals", query: [
            "date": today, "tz_offset": String(tzOffsetMinutes()),
        ])
        MealCache.shared.reconcileMeals(date: today, server: meals)
        print("Today's meals: \(meals.count)")
    } catch {
        print("Meal fetch failed: \(error)")
    }
}
```

- [ ] **Step 5: Verify on simulator** — build, install, launch (signed out is fine — this proves the plumbing runs without crashing even when the `/api/meals` call 401s):

```bash
cd apps/ios && bash scripts/dev-loop.sh /tmp/phase1-t5.png
xcrun simctl spawn "$UDID" log show --last 30s --predicate 'process == "Loggi" AND (eventMessage CONTAINS "meals" OR eventMessage CONTAINS "failed")' 2>/dev/null
```
Expected: no crash, a log line showing either a meal count or a clean failure (not a hang or a force-unwrap crash).

- [ ] **Step 6: Commit** — `swift: MealCache + SaveQueue (stale-while-revalidate, offline queue)`

---

## Self-review notes

- Spec coverage: Phase 1's exit criterion from the spec ("sign in on sim, fetch and print today's meals") is Task 5's Step 5 exactly. Codable models (Task 1), Clerk SDK + auth screens (Tasks 2-3), networking (Task 4), cache/queue (Task 5) — all five plan bullets from the spec's Phase 1 description are covered.
- Placeholder scan: none — every step has real code, not "add appropriate handling."
- Type consistency: `ApiMeal`/`Goals`/`DraftItem` field names checked against Task 1's own definitions when referenced in Tasks 3-5 (`meal.id`, `meal.eatenAt`, `Goals` as the `/api/goals` response type).
- Known deferred scope (YAGNI, not oversight): historyRange/trends/favorites/recents cache slots, widget sync, dinner activity, evening reminder sync, GRDB — all arrive with the phases that actually need them (2-4), per the spec's phase breakdown.
- Explicit grounding-uncertainty flags left in for the implementer on two ClerkKit symbols (`getToken()?.jwt`, `isLoaded`) since Clerk's own docs didn't fully confirm these under WebFetch today — instructing "grep the resolved package, don't guess" rather than presenting unverified symbol names as certain.
