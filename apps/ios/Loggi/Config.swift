import Foundation

enum Config {
    static let apiBaseURL = URL(string: "https://mealio-api-five.vercel.app")!
    /// Same Clerk instance/users as the RN app (apps/mobile/.env.local).
    static let clerkPublishableKey = "pk_test_bXVzaWNhbC1yZWluZGVlci05Ni5jbGVyay5hY2NvdW50cy5kZXYk"
}
