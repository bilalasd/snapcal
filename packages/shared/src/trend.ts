/**
 * Weight-trend and energy-balance math (spec §8).
 * Pure functions over plain data so everything here is unit-testable.
 */

export interface WeightPoint {
  date: string; // YYYY-MM-DD
  weightKg: number;
}

export interface TrendPoint extends WeightPoint {
  trendKg: number;
}

export interface DayIntake {
  date: string; // YYYY-MM-DD
  calories: number;
}

const KCAL_PER_KG = 7700;
const EMA_ALPHA_PER_DAY = 0.1;
export const RATE_WINDOW_DAYS = 14;
export const MIN_HISTORY_DAYS = 14;
export const MIN_LOGGED_DAYS = 10;
export const MIN_WEIGH_INS = 4;
export const ON_TRACK_TOLERANCE_KCAL = 100;

function dayDiff(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * Exponentially-smoothed trend over daily weigh-ins (TrendWeight approach).
 * Gaps between weigh-ins increase the effective smoothing factor so the trend
 * catches up at the same per-day rate regardless of missed days.
 */
export function computeTrend(points: WeightPoint[]): TrendPoint[] {
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const result: TrendPoint[] = [];
  let trend = 0;

  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i];
    if (i === 0) {
      trend = point.weightKg;
    } else {
      const gap = Math.max(1, dayDiff(sorted[i - 1].date, point.date));
      const alpha = 1 - Math.pow(1 - EMA_ALPHA_PER_DAY, gap);
      trend = trend + alpha * (point.weightKg - trend);
    }
    result.push({ ...point, trendKg: round2(trend) });
  }
  return result;
}

/**
 * Current rate of change in kg/week: least-squares slope of the trend line
 * over the trailing `windowDays`, anchored at the most recent weigh-in.
 * Null when fewer than 2 trend points fall inside the window.
 */
export function computeRateKgPerWeek(
  trend: TrendPoint[],
  windowDays = RATE_WINDOW_DAYS,
): number | null {
  if (trend.length < 2) return null;
  const last = trend[trend.length - 1];
  const windowPoints = trend.filter(
    (p) => dayDiff(p.date, last.date) < windowDays,
  );
  if (windowPoints.length < 2) return null;

  // x = day offset, y = trend weight
  const xs = windowPoints.map((p) => dayDiff(windowPoints[0].date, p.date));
  const ys = windowPoints.map((p) => p.trendKg);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;
  return round2((num / den) * 7);
}

export interface EnergyBalance {
  avgIntakeKcal: number;
  tdeeKcal: number;
  actualDeficitKcal: number; // positive = deficit
  loggedDays: number;
  weighIns: number;
  windowDays: number;
}

/**
 * Measured maintenance calories over a window:
 * TDEE ≈ avg intake − (Δtrend kg × 7700 / days).
 * Days with zero logged meals are excluded from the intake average.
 * Returns null when the window has <2 trend points or no logged days.
 */
export function computeEnergyBalance(
  trend: TrendPoint[],
  intake: DayIntake[],
  windowDays = RATE_WINDOW_DAYS,
): EnergyBalance | null {
  if (trend.length < 2) return null;
  const last = trend[trend.length - 1];
  const windowPoints = trend.filter(
    (p) => dayDiff(p.date, last.date) < windowDays,
  );
  if (windowPoints.length < 2) return null;

  const start = windowPoints[0];
  const end = windowPoints[windowPoints.length - 1];
  const spanDays = dayDiff(start.date, end.date);
  if (spanDays < 1) return null;

  const loggedInWindow = intake.filter(
    (d) =>
      d.calories > 0 &&
      d.date >= start.date &&
      d.date <= end.date,
  );
  if (loggedInWindow.length === 0) return null;

  const avgIntake =
    loggedInWindow.reduce((sum, d) => sum + d.calories, 0) /
    loggedInWindow.length;

  const deltaKg = end.trendKg - start.trendKg;
  const tdee = avgIntake - (deltaKg * KCAL_PER_KG) / spanDays;

  return {
    avgIntakeKcal: Math.round(avgIntake),
    tdeeKcal: Math.round(tdee),
    actualDeficitKcal: Math.round(tdee - avgIntake),
    loggedDays: loggedInWindow.length,
    weighIns: windowPoints.length,
    windowDays: spanDays,
  };
}

export type VerdictStatus = "collecting" | "on_track" | "adjust";

export interface Verdict {
  status: VerdictStatus;
  /** kcal/day to remove (positive) or add (negative) to hit the target rate. */
  adjustKcal: number;
  neededDeficitKcal: number;
  actualDeficitKcal: number;
  /** Reasons the verdict is still "collecting", empty otherwise. */
  missing: string[];
}

export function computeVerdict(
  balance: EnergyBalance | null,
  trend: TrendPoint[],
  targetRateKgPerWk: number,
): Verdict {
  const missing: string[] = [];

  const historySpan =
    trend.length >= 2
      ? dayDiff(trend[0].date, trend[trend.length - 1].date)
      : 0;
  if (historySpan < MIN_HISTORY_DAYS) {
    missing.push(`${MIN_HISTORY_DAYS - historySpan} more days of history`);
  }
  if (!balance || balance.loggedDays < MIN_LOGGED_DAYS) {
    const have = balance?.loggedDays ?? 0;
    missing.push(`${MIN_LOGGED_DAYS - have} more logged days`);
  }
  if (!balance || balance.weighIns < MIN_WEIGH_INS) {
    const have = balance?.weighIns ?? 0;
    missing.push(`${MIN_WEIGH_INS - have} more weigh-ins`);
  }

  if (missing.length > 0 || !balance) {
    return {
      status: "collecting",
      adjustKcal: 0,
      neededDeficitKcal: 0,
      actualDeficitKcal: balance?.actualDeficitKcal ?? 0,
      missing,
    };
  }

  // Losing weight (negative rate) requires a positive daily deficit.
  const neededDeficit = (-targetRateKgPerWk * KCAL_PER_KG) / 7;
  const diff = neededDeficit - balance.actualDeficitKcal;

  return {
    status:
      Math.abs(diff) <= ON_TRACK_TOLERANCE_KCAL ? "on_track" : "adjust",
    adjustKcal: Math.round(diff),
    neededDeficitKcal: Math.round(neededDeficit),
    actualDeficitKcal: balance.actualDeficitKcal,
    missing: [],
  };
}

export interface AuditStats {
  avgIntakeKcal: number;
  measuredTdeeKcal: number;
  formulaTdeeKcal: number;
  /** formula − measured, rounded to the nearest 10. */
  driftKcal: number;
}

/** The Monday-note audit: logged vs measured vs formula (spec 2026-07-16). */
export function computeAuditStats(
  balance: EnergyBalance,
  formulaTdeeKcal: number,
): AuditStats {
  return {
    avgIntakeKcal: balance.avgIntakeKcal,
    measuredTdeeKcal: balance.tdeeKcal,
    formulaTdeeKcal,
    driftKcal: Math.round((formulaTdeeKcal - balance.tdeeKcal) / 10) * 10,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Wire shape of GET /api/trends — the one type every consumer (Today,
 *  Weight, Settings) and the client-side trends cache share. */
export interface TrendsResponse {
  weights: TrendPoint[];
  rate_kg_per_week: number | null;
  balance: EnergyBalance | null;
  verdict: Verdict;
  adaptive_goal_kcal: number | null;
  audit: AuditStats | null;
  target_rate_kg_per_wk: number;
  goal_weight_kg: number | null;
  unit_system: "metric" | "imperial";
  recap: { week_start: string; content: string } | null;
}
