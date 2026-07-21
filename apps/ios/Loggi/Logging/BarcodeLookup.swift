import Foundation

/// Barcode → food item, via Open Food Facts. Ports lib/barcode.ts.
///
/// Note this does NOT go through our API — it's a direct third-party call, so
/// it carries no Clerk token and its failures are never queued. A miss returns
/// nil rather than throwing: "that barcode isn't in the database" is a normal
/// outcome the UI handles by keeping the camera open, not an error.
enum BarcodeLookup {

    /// Open Food Facts' nutriment blocks are untyped JSON where any field can
    /// be a number, a numeric string, or absent. Decoding into a dictionary of
    /// `JSONValue` keeps the port faithful to the JS, which just indexes in.
    private enum JSONValue: Decodable {
        case number(Double), string(String), other

        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let d = try? c.decode(Double.self) { self = .number(d) }
            else if let s = try? c.decode(String.self) { self = .string(s) }
            else { self = .other }
        }
        var double: Double? {
            switch self {
            case .number(let d): return d
            case .string(let s): return Double(s)
            case .other: return nil
            }
        }
    }

    private struct Response: Decodable {
        let status: Int?
        let product: Product?
    }
    private struct Product: Decodable {
        let product_name: String?
        let brands: String?
        let serving_size: String?
        let nutriments: [String: JSONValue]?
    }

    private static func round1(_ x: Double) -> Double { (x * 10).rounded() / 10 }

    static func lookup(_ code: String) async -> DraftItem? {
        let fields = "product_name,brands,serving_size,nutriments"
        guard let url = URL(string: "https://world.openfoodfacts.org/api/v2/product/\(code).json?fields=\(fields)")
        else { return nil }

        var request = URLRequest(url: url, timeoutInterval: 10)
        request.setValue("Loggi/0.1 (barcode)", forHTTPHeaderField: "User-Agent")

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let body = try? JSONDecoder().decode(Response.self, from: data),
              body.status == 1, let product = body.product
        else { return nil }

        let n = product.nutriments ?? [:]
        // Per-serving is what a user actually eats; per-100g is the fallback,
        // and it's labelled honestly as a 100 g portion so the number isn't a lie.
        let perServing = n["energy-kcal_serving"]?.double != nil
        let suffix = perServing ? "_serving" : "_100g"
        func val(_ base: String) -> Double { n["\(base)\(suffix)"]?.double ?? 0 }

        let kcal = val("energy-kcal").rounded()
        guard kcal > 0 else { return nil } // no usable calorie data — treat as a miss

        let brand = product.brands?.split(separator: ",").first.map {
            $0.trimmingCharacters(in: .whitespaces)
        }
        let name = [brand, product.product_name?.trimmingCharacters(in: .whitespaces)]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " ")

        let hasSatFat = n["saturated-fat\(suffix)"]?.double != nil
        let hasFiber = n["fiber\(suffix)"]?.double != nil
        let hasSugar = n["sugars\(suffix)"]?.double != nil
        let hasSodium = n["sodium\(suffix)"]?.double != nil

        return DraftItem(
            name: name.isEmpty ? "Scanned item" : name,
            portion: perServing ? (product.serving_size ?? "1 serving") : "100 g",
            calories: kcal,
            proteinG: round1(val("proteins")),
            carbsG: round1(val("carbohydrates")),
            fatG: round1(val("fat")),
            satFatG: hasSatFat ? round1(val("saturated-fat")) : nil,
            fiberG: hasFiber ? round1(val("fiber")) : nil,
            sugarG: hasSugar ? round1(val("sugars")) : nil,
            // Open Food Facts reports sodium in GRAMS; the app stores mg.
            sodiumMg: hasSodium ? (val("sodium") * 1000).rounded() : nil)
    }
}
