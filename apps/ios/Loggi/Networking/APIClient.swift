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
        // Session.getToken(_:) already returns the token string directly — it unwraps
        // `.jwt` internally (clerk-ios SDK: Domains/Auth/Session/Session.swift:327-328,
        // `func getToken(...) async throws -> String? { try await
        // SessionTokenFetcher.shared.getToken(self, options: options)?.jwt }`).
        // The brief's original guess, `Clerk.shared.session?.getToken()?.jwt`, does not
        // compile — `?.jwt` is invalid on the `String?` that `getToken()` already returns.
        // `try?` + optional chaining flattens to a single `String?`, so unauthenticated
        // requests (no session) simply omit the header, matching `lib/api.ts`'s
        // `token ? {...} : {}` pattern — never crash/throw when signed out.
        if let token = try? await Clerk.shared.session?.getToken() {
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

    /// Like get(), but hands back the undecoded body — the account export
    /// re-serializes the server's payload verbatim, so a typed model can't
    /// silently drop fields the API returns (or gains later).
    func getRaw(_ path: String, query: [String: String] = [:]) async throws -> Data {
        let request = try await makeRequest(path, method: "GET", query: query, body: nil)
        let (data, _) = try await send(request)
        return data
    }

    func post<T: Decodable>(_ path: String, body: Encodable) async throws -> T {
        let bodyData = try JSONEncoder().encode(AnyEncodable(body))
        let request = try await makeRequest(path, method: "POST", query: [:], body: bodyData)
        let (data, _) = try await send(request)
        do { return try JSONDecoder().decode(T.self, from: data) } catch { throw APIError.decoding }
    }

    /// lib/api.ts's fetchJson is method-agnostic; settings.tsx's `put()` calls
    /// it with `{ method: "PUT" }` for /api/goals specifically (goals are a
    /// singleton resource updated in place, unlike meals' POST-to-create).
    func put<T: Decodable>(_ path: String, body: Encodable) async throws -> T {
        let bodyData = try JSONEncoder().encode(AnyEncodable(body))
        let request = try await makeRequest(path, method: "PUT", query: [:], body: bodyData)
        let (data, _) = try await send(request)
        do { return try JSONDecoder().decode(T.self, from: data) } catch { throw APIError.decoding }
    }

    @discardableResult
    func delete(_ path: String) async throws -> Data {
        let request = try await makeRequest(path, method: "DELETE", query: [:], body: nil)
        let (data, _) = try await send(request)
        return data
    }

    /// Raw-bytes POST. `/api/photos` reads `request.arrayBuffer()` with an
    /// image content-type — NOT multipart, which is the easy wrong assumption.
    func postBinary<T: Decodable>(_ path: String, body: Data, contentType: String) async throws -> T {
        var request = try await makeRequest(path, method: "POST", query: [:], body: body)
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        let (data, _) = try await send(request)
        do { return try JSONDecoder().decode(T.self, from: data) } catch { throw APIError.decoding }
    }

    /// Like post(), but takes pre-encoded JSON body — the save queue re-sends
    /// a body it persisted verbatim rather than re-encoding a live Swift value.
    func postRaw<T: Decodable>(_ path: String, bodyJSON: Data) async throws -> T {
        let request = try await makeRequest(path, method: "POST", query: [:], body: bodyJSON)
        let (data, _) = try await send(request)
        do { return try JSONDecoder().decode(T.self, from: data) } catch { throw APIError.decoding }
    }
}

/// Type-erasing wrapper so `post` can accept any Encodable body without a generic
/// parameter explosion at call sites — mirrors JSON.stringify(body) ergonomics.
private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { encodeFunc = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeFunc(encoder) }
}
