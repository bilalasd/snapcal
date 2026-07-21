import Foundation
import UserNotifications

/// Local notifications: the Monday note and the evening reminder. Ports
/// lib/notifications.ts.
///
/// Both are LOCAL, not push — the content is generated on-device from data the
/// app already has, so there's no server, no device token, and nothing to leak.
enum NotificationService {
    private static let mondayNoteId = "loggi.monday-note"
    private static let eveningReminderId = "loggi.evening-reminder"

    @discardableResult
    static func requestAuthorization() async -> Bool {
        let center = UNUserNotificationCenter.current()
        return (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    static func authorizationStatus() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    /// Monday 9am local, repeating. The recap itself is written by the server
    /// cron on Sunday evening, so by Monday morning it's already waiting —
    /// this only nudges the user to go read it.
    static func scheduleMondayNote() async {
        guard await requestAuthorization() else { return }
        var components = DateComponents()
        components.weekday = 2 // Sunday == 1, so Monday == 2
        components.hour = 9
        components.minute = 0

        let content = UNMutableNotificationContent()
        content.title = "Your week in review"
        content.body = "Here's how last week actually went."
        content.sound = .default
        content.userInfo = ["route": "today"]

        let request = UNNotificationRequest(
            identifier: mondayNoteId,
            content: content,
            trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: true))
        try? await UNUserNotificationCenter.current().add(request)
    }

    /// Evening nudge at 8pm, repeating daily.
    static func scheduleEveningReminder() async {
        guard await requestAuthorization() else { return }
        var components = DateComponents()
        components.hour = 20
        components.minute = 0

        let content = UNMutableNotificationContent()
        content.title = "Anything left to log?"
        content.body = "A quick snap now keeps the day honest."
        content.sound = .default
        content.userInfo = ["route": "add"]

        let request = UNNotificationRequest(
            identifier: eveningReminderId,
            content: content,
            trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: true))
        try? await UNUserNotificationCenter.current().add(request)
    }

    static func cancelMondayNote() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [mondayNoteId])
    }
    static func cancelEveningReminder() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [eveningReminderId])
    }

    /// Which of ours are actually scheduled. Settings' toggles read this
    /// rather than a local flag, which would drift the moment a user turns
    /// notifications off in system Settings.
    static func scheduled() async -> (monday: Bool, evening: Bool) {
        let pending = await UNUserNotificationCenter.current().pendingNotificationRequests()
        let ids = Set(pending.map(\.identifier))
        return (ids.contains(mondayNoteId), ids.contains(eveningReminderId))
    }
}
