import AsyncStorage from "@react-native-async-storage/async-storage";
import { localDateString, type ApiMeal } from "@loggi/shared";
import { getCachedRange } from "./cache";
import { fetchMealsRange } from "./api";

export interface Milestone {
  id: "first-meal" | "week-logged" | "first-working" | "month-of-weighins";
  headline: string;
  sub: string;
}

const SEEN_KEY = "milestones-seen";

interface TrendsSlice {
  verdict?: { status: string };
  weights?: Array<{ date: string }>;
}

/** Pure detection over plain data — beavers build, nothing here can break.
 *  Returns every currently-true milestone; the caller filters seen ones. */
export function detectMilestones(
  loggedDays: Set<string>,
  totalMeals: number,
  trends: TrendsSlice | null,
): Milestone[] {
  const found: Milestone[] = [];

  if (totalMeals === 1) {
    found.push({
      id: "first-meal",
      headline: "First stick on the dam",
      sub: "One meal logged. That's how every dam starts.",
    });
  }

  // Seven consecutive days ending today or yesterday, each with ≥1 real meal.
  for (const endOffset of [0, 1]) {
    let run = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - endOffset - i);
      if (loggedDays.has(localDateString(d))) run++;
      else break;
    }
    if (run >= 7) {
      found.push({
        id: "week-logged",
        headline: "A full week on the log",
        sub: "Seven straight days logged. Steady beats perfect.",
      });
      break;
    }
  }

  if (trends?.verdict?.status === "on_track") {
    found.push({
      id: "first-working",
      headline: "The plan is working",
      sub: "Scale-verified: intake and trend agree with the target.",
    });
  }

  const dates = (trends?.weights ?? []).map((w) => w.date).sort();
  if (dates.length >= 8) {
    const spanDays = Math.round(
      (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86_400_000,
    );
    if (spanDays >= 27) {
      found.push({
        id: "month-of-weighins",
        headline: "Four weeks of trend data",
        sub: "A month of weigh-ins — the trend line means something now.",
      });
    }
  }

  return found;
}

async function seenSet(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function markMilestoneSeen(id: Milestone["id"]): Promise<void> {
  const seen = await seenSet();
  seen.add(id);
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
}

/** The one new milestone to offer right now, or null. Uses the cached 30-day
 *  range when History already loaded it; otherwise fetches once, off the
 *  critical path (caller runs this after first paint). */
export async function checkMilestones(trends: TrendsSlice | null): Promise<Milestone | null> {
  const seen = await seenSet();

  let range: ApiMeal[] | null = getCachedRange();
  if (!range) {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    range = await fetchMealsRange(from, to).catch(() => null);
  }
  if (!range) return null;

  const real = range.filter((m) => !m.planned);
  const loggedDays = new Set(real.map((m) => localDateString(new Date(m.eatenAt))));

  const fresh = detectMilestones(loggedDays, real.length, trends).filter(
    (m) => !seen.has(m.id),
  );
  return fresh[0] ?? null;
}
