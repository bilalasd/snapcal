import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

// Monday verdict note: a local weekly notification + persistent flags for the
// Today card. All state is on-device — the server only supplies the recap.

const PREF_KEY = "monday-note:pref"; // "on" | "off"; unset = never offered
const NOTIFICATION_ID = "monday-note";
const DISMISSED_KEY = "monday-note:dismissed-week"; // week_start of the dismissed note
const PREV_GOAL_KEY = "monday-note:prev-goal"; // JSON { weekStart, kcal }

// Show scheduled notifications even if the app happens to be foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function getMondayNotePref(): Promise<"on" | "off" | null> {
  return (await AsyncStorage.getItem(PREF_KEY)) as "on" | "off" | null;
}

/** Ask permission and schedule the weekly Monday 9:00 note. False = denied. */
export async function enableMondayNote(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") {
    await AsyncStorage.setItem(PREF_KEY, "off");
    return false;
  }
  // Scoped by identifier — the evening reminder (lib/reminder.ts) schedules too.
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: "Bevi's Monday note is in",
      body: "See how last week went — and what this week's target is.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 2, // 1 = Sunday
      hour: 9,
      minute: 0,
    },
  });
  await AsyncStorage.setItem(PREF_KEY, "on");
  return true;
}

export async function disableMondayNote(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
  await AsyncStorage.setItem(PREF_KEY, "off");
}

export async function getDismissedWeek(): Promise<string | null> {
  return AsyncStorage.getItem(DISMISSED_KEY);
}

export async function dismissWeek(weekStart: string): Promise<void> {
  await AsyncStorage.setItem(DISMISSED_KEY, weekStart);
}

/** Remember this week's adaptive goal; returns the previous week's, if any.
 *  Idempotent within a week — re-calling keeps returning the same previous. */
export async function rememberGoal(
  weekStart: string,
  kcal: number | null,
): Promise<number | null> {
  const raw = await AsyncStorage.getItem(PREV_GOAL_KEY);
  const stored = raw
    ? (JSON.parse(raw) as { weekStart: string; kcal: number | null; prevKcal: number | null })
    : null;
  if (stored && stored.weekStart === weekStart) return stored.prevKcal;
  const prevKcal = stored?.kcal ?? null;
  await AsyncStorage.setItem(PREV_GOAL_KEY, JSON.stringify({ weekStart, kcal, prevKcal }));
  return prevKcal;
}
