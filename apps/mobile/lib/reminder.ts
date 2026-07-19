import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { localDateString } from "@loggi/shared";

// Gentle evening nudge: a local notification on days with nothing logged.
// Off by default (Settings toggle), skips days that already have a meal, and
// never mentions streaks — "welcome back", not "you broke it" (PRODUCT §3.5).
// ponytail: fixed 20:00 — a time picker can come when someone asks for it.

const PREF_KEY = "evening-reminder:pref"; // "on" | "off"; unset = never enabled
const ID_PREFIX = "evening-reminder-"; // identifier per scheduled day
const HOUR = 20;
// One week of one-shot notifications, re-rolled on every app use: repeating
// triggers can't skip a single day, and this way the nudges quietly stop if
// the app is abandoned instead of nagging forever.
const DAYS_AHEAD = 7;

export async function getEveningReminderPref(): Promise<"on" | "off" | null> {
  return (await AsyncStorage.getItem(PREF_KEY)) as "on" | "off" | null;
}

/** Ask permission and start the nudges. False = permission denied. */
export async function enableEveningReminder(loggedToday: boolean): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") {
    await AsyncStorage.setItem(PREF_KEY, "off");
    return false;
  }
  await AsyncStorage.setItem(PREF_KEY, "on");
  lastSyncKey = null;
  await syncEveningReminder(loggedToday);
  return true;
}

export async function disableEveningReminder(): Promise<void> {
  await AsyncStorage.setItem(PREF_KEY, "off");
  lastSyncKey = null;
  await cancelEveningReminders();
}

// The cache calls sync on every meal change; only a flip of "anything logged
// today?" (or a new day) is worth the reschedule round-trip.
let lastSyncKey: string | null = null;

export async function syncEveningReminder(loggedToday: boolean): Promise<void> {
  const key = `${localDateString()}:${loggedToday}`;
  if (key === lastSyncKey) return;
  if ((await getEveningReminderPref()) !== "on") return;
  lastSyncKey = key;
  try {
    await cancelEveningReminders();
    const now = new Date();
    for (let i = 0; i < DAYS_AHEAD; i++) {
      // Today's slot is skipped once something is logged — or already past.
      if (i === 0 && (loggedToday || now.getHours() >= HOUR)) continue;
      const fireAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, HOUR, 0, 0);
      await Notifications.scheduleNotificationAsync({
        identifier: `${ID_PREFIX}${localDateString(fireAt)}`,
        content: {
          title: "Nothing logged today",
          body: "Snap your next meal when you get to it — it takes seconds.",
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
      });
    }
  } catch {
    lastSyncKey = null; // let the next cache change retry
  }
}

async function cancelEveningReminders(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => n.identifier.startsWith(ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}
