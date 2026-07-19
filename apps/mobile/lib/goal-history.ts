import { localDateString } from "@loggi/shared";
import { readJson, writeJson } from "./disk";

// The calorie goal the app showed for each local day, so "on target" judges a
// past day by the goal that was in effect then — the smart goal moves every
// Monday, and re-grading history against the new number rewrites it.
// ponytail: on-device only — after a reinstall, old days fall back to being
// judged by the current goal, same as before this existed.

const FILE = "goal-history.json";
const KEEP_DAYS = 90;

let history: Record<string, number> = {};

/** App start. Records made before hydration win over the disk copy. */
export async function hydrateGoalHistory(): Promise<void> {
  history = { ...((await readJson<Record<string, number>>(FILE)) ?? {}), ...history };
}

/** Today screen records the goal it's actually displaying. */
export function recordDailyGoal(date: string, kcal: number): void {
  if (!(kcal > 0) || history[date] === kcal) return;
  history[date] = kcal;
  const cutoff = localDateString(new Date(Date.now() - KEEP_DAYS * 86_400_000));
  for (const d of Object.keys(history)) if (d < cutoff) delete history[d];
  void writeJson(FILE, history);
}

export function goalForDate(date: string, fallback: number): number {
  return history[date] ?? fallback;
}
