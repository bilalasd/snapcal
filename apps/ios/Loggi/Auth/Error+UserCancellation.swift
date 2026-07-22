import AuthenticationServices
import Foundation

extension Error {
    /// True when the user (or the system) cancelled an auth flow — dismissing
    /// the Apple sheet, closing the Google browser — so no error UI should
    /// show. Ported verbatim from clerk-ios' AirbnbClone example, which keeps
    /// this as an app-level helper rather than shipping it in the SDK.
    var isUserCancellation: Bool {
        if case ASWebAuthenticationSessionError.canceledLogin = self { return true }
        if let authError = self as? ASAuthorizationError,
           authError.errorUserInfo["NSLocalizedFailureReason"] == nil {
            return true
        }
        if self is CancellationError { return true }
        return false
    }
}
