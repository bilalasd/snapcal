// "Your usual" — pick the meal the user habitually eats at this time of day,
// so Today can offer a one-tap re-log. Pure so it's trivially testable; the
// suggestions route feeds it 45 days of meal headers.

export interface UsualCandidate {
  id: string;
  name: string;
  eatenAt: string; // ISO
}

export type DayBucket = "morning" | "midday" | "evening" | "night";

/** Local hour → time-of-day bucket. */
export function bucketOfHour(hour: number): DayBucket {
  if (hour >= 4 && hour < 11) return "morning";
  if (hour >= 11 && hour < 16) return "midday";
  if (hour >= 16 && hour < 22) return "evening";
  return "night";
}

function localParts(iso: string, tzOffsetMin: number): { date: string; hour: number } {
  // Client passes getTimezoneOffset(); local time = UTC - offset
  const local = new Date(new Date(iso).getTime() - tzOffsetMin * 60_000);
  return { date: local.toISOString().slice(0, 10), hour: local.getUTCHours() };
}

const keyOf = (name: string) => name.trim().toLowerCase();

/**
 * Returns the id of the meal to suggest, or null. A meal qualifies when its
 * name was logged ≥3 times in the current time-of-day bucket and hasn't been
 * logged yet today (any bucket). Most occurrences wins; ties break by recency.
 */
export function pickUsual(
  meals: UsualCandidate[],
  now: Date,
  tzOffsetMin: number,
): string | null {
  const { date: today, hour } = localParts(now.toISOString(), tzOffsetMin);
  const bucket = bucketOfHour(hour);

  const loggedToday = new Set<string>();
  const groups = new Map<string, { count: number; latest: UsualCandidate }>();

  for (const meal of meals) {
    const key = keyOf(meal.name);
    if (!key) continue;
    const parts = localParts(meal.eatenAt, tzOffsetMin);
    if (parts.date === today) loggedToday.add(key);
    if (bucketOfHour(parts.hour) !== bucket) continue;
    const group = groups.get(key);
    if (!group) groups.set(key, { count: 1, latest: meal });
    else {
      group.count += 1;
      if (meal.eatenAt > group.latest.eatenAt) group.latest = meal;
    }
  }

  let best: { count: number; latest: UsualCandidate } | null = null;
  for (const [key, group] of groups) {
    if (group.count < 3 || loggedToday.has(key)) continue;
    if (
      !best ||
      group.count > best.count ||
      (group.count === best.count && group.latest.eatenAt > best.latest.eatenAt)
    ) {
      best = group;
    }
  }
  return best?.latest.id ?? null;
}
