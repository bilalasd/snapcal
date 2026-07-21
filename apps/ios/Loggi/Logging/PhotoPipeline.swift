import Foundation
import UIKit

/// Everything that happens to a meal photo between the shutter and the API.
/// Ports lib/photos.ts.
///
/// Two destinations, deliberately different:
/// - `/api/analyze` wants **base64 inline** (max 3 images, ≤ the model's limit)
/// - `/api/photos` wants **raw bytes** and returns a blob URL to attach to the meal
///
/// Both are fed from the same downscaled JPEG so a 12MP capture never goes
/// over the wire at full size — the API caps uploads at 3 MB and a raw iPhone
/// photo blows straight past that.
enum PhotoPipeline {
    /// 1280px on the long edge at 0.7 quality. Large enough for the model to
    /// read a plate or a nutrition label, small enough to upload on cellular.
    static let maxEdge: CGFloat = 1280
    static let quality: CGFloat = 0.7
    /// Matches MAX_BYTES in apps/api/src/app/api/photos/route.ts.
    static let maxBytes = 3 * 1024 * 1024

    /// Downscale + JPEG-encode. Returns nil only if the image can't be encoded
    /// at all, which in practice means a corrupt capture.
    static func prepare(_ image: UIImage) -> Data? {
        let size = image.size
        let longest = max(size.width, size.height)
        let scale = longest > maxEdge ? maxEdge / longest : 1
        let target = CGSize(width: (size.width * scale).rounded(),
                            height: (size.height * scale).rounded())

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1 // points == pixels; the source is already at device scale
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }

        guard var data = resized.jpegData(compressionQuality: quality) else { return nil }
        // Belt and braces: a very noisy 1280px photo can still exceed the cap,
        // so step the quality down rather than letting the upload 400.
        var q = quality
        while data.count > maxBytes, q > 0.3 {
            q -= 0.1
            guard let smaller = resized.jpegData(compressionQuality: q) else { break }
            data = smaller
        }
        return data
    }

    /// Upload one photo, returning the blob reference to attach to a meal.
    /// The route takes the raw bytes with an image content-type — not
    /// multipart, which is easy to assume and wrong.
    static func upload(_ jpeg: Data) async throws -> DraftPhoto {
        struct Response: Decodable { let url: String; let pathname: String }
        let response: Response = try await APIClient.shared.postBinary(
            "/api/photos", body: jpeg, contentType: "image/jpeg")
        return DraftPhoto(url: response.url, pathname: response.pathname)
    }

    /// Base64 payload for `/api/analyze`. Capped at 3 images to match the
    /// route, which silently slices anything beyond that.
    static func analyzePayload(_ jpegs: [Data]) -> [AnalyzeImage] {
        jpegs.prefix(3).map { AnalyzeImage(media_type: "image/jpeg", data: $0.base64EncodedString()) }
    }
}

/// Inline image for /api/analyze. snake_case to match the route's body shape.
struct AnalyzeImage: Encodable {
    let media_type: String
    let data: String
}
