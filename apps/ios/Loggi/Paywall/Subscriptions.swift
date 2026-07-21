import Foundation
import StoreKit

/// StoreKit 2 subscription state. Ports lib/purchases.ts.
///
/// UNVERIFIED — and this one can't be verified by code alone. It needs the
/// products to exist in App Store Connect (or a StoreKit configuration file in
/// the scheme) before `Product.products(for:)` returns anything. Until then
/// `products` comes back empty and the paywall shows its fallback prices.
/// Treat this as wired, not proven.
@MainActor
@Observable
final class Subscriptions {
    static let shared = Subscriptions()

    static let monthlyID = "com.loggi.app.monthly"
    static let yearlyID = "com.loggi.app.yearly"
    /// Fallback copy for when StoreKit hasn't loaded — the real displayPrice
    /// is localised and always preferred. Matches PRODUCT.md's pricing.
    static let fallbackPrices = [monthlyID: "$4.99", yearlyID: "$49.99"]

    private(set) var products: [Product] = []
    private(set) var isSubscribed = false
    private(set) var loadFailed = false
    var purchasing: String?

    private var updatesTask: Task<Void, Never>?

    private init() {
        // Transactions can arrive outside a purchase — a renewal, a family
        // share, a purchase made on another device. Without this listener the
        // app would only learn about entitlement changes on next launch.
        updatesTask = Task { [weak self] in
            for await update in Transaction.updates {
                guard let self else { return }
                if case .verified(let transaction) = update {
                    await transaction.finish()
                    await self.refreshEntitlement()
                }
            }
        }
    }

    func load() async {
        do {
            products = try await Product.products(for: [Self.monthlyID, Self.yearlyID])
            loadFailed = products.isEmpty
        } catch {
            loadFailed = true
        }
        await refreshEntitlement()
    }

    /// The source of truth for "is this user paying" is the current
    /// entitlement, never a local flag — a receipt can be revoked, refunded,
    /// or expire while the app is closed.
    func refreshEntitlement() async {
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result,
               transaction.productID == Self.monthlyID || transaction.productID == Self.yearlyID,
               transaction.revocationDate == nil {
                isSubscribed = true
                return
            }
        }
        isSubscribed = false
    }

    func price(for id: String) -> String {
        products.first { $0.id == id }?.displayPrice ?? Self.fallbackPrices[id] ?? "—"
    }

    enum PurchaseOutcome { case success, cancelled, pending, failed(String) }

    func purchase(_ id: String) async -> PurchaseOutcome {
        guard let product = products.first(where: { $0.id == id }) else {
            return .failed("That plan isn't available right now.")
        }
        purchasing = id
        defer { purchasing = nil }
        do {
            switch try await product.purchase() {
            case .success(let verification):
                guard case .verified(let transaction) = verification else {
                    // An unverified transaction is a failed signature check —
                    // never grant access on one.
                    return .failed("Couldn't verify that purchase.")
                }
                await transaction.finish()
                await refreshEntitlement()
                return .success
            case .userCancelled:
                return .cancelled
            case .pending:
                // Ask-to-buy or SCA: the purchase may complete later, and the
                // Transaction.updates listener above is what catches it.
                return .pending
            @unknown default:
                return .failed("Something unexpected happened.")
            }
        } catch {
            return .failed(error.localizedDescription)
        }
    }

    func restore() async -> Bool {
        try? await AppStore.sync()
        await refreshEntitlement()
        return isSubscribed
    }
}
