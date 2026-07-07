import { describe, expect, it } from "vitest";
import {
  computeEnergyBalance,
  computeRateKgPerWeek,
  computeTrend,
  computeVerdict,
  type DayIntake,
  type WeightPoint,
} from "./trend";

function daysOfWeights(
  startDate: string,
  weightsKg: number[],
  skipDays: number[] = [],
): WeightPoint[] {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  return weightsKg
    .map((weightKg, i) => ({
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      weightKg,
    }))
    .filter((_, i) => !skipDays.includes(i));
}

function daysOfIntake(startDate: string, calories: number[]): DayIntake[] {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  return calories.map((cal, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    calories: cal,
  }));
}

describe("computeTrend", () => {
  it("starts at the first weight", () => {
    const trend = computeTrend(daysOfWeights("2026-06-01", [80, 81]));
    expect(trend[0].trendKg).toBe(80);
  });

  it("smooths noise: trend moves 10% toward each new value", () => {
    const trend = computeTrend(daysOfWeights("2026-06-01", [80, 90]));
    expect(trend[1].trendKg).toBeCloseTo(81, 5); // 80 + 0.1 × 10
  });

  it("sorts unordered input by date", () => {
    const points = daysOfWeights("2026-06-01", [80, 81, 82]).reverse();
    const trend = computeTrend(points);
    expect(trend[0].date).toBe("2026-06-01");
    expect(trend[0].trendKg).toBe(80);
  });

  it("applies compounded alpha across weigh-in gaps", () => {
    // Day 0: 80, then a 2-day gap to day 2: 90
    const points: WeightPoint[] = [
      { date: "2026-06-01", weightKg: 80 },
      { date: "2026-06-03", weightKg: 90 },
    ];
    const trend = computeTrend(points);
    // alpha = 1 - 0.9^2 = 0.19 → 80 + 0.19 × 10 = 81.9
    expect(trend[1].trendKg).toBeCloseTo(81.9, 5);
  });

  it("handles empty input", () => {
    expect(computeTrend([])).toEqual([]);
  });
});

describe("computeRateKgPerWeek", () => {
  it("returns null with fewer than 2 points", () => {
    expect(computeRateKgPerWeek([])).toBeNull();
    expect(
      computeRateKgPerWeek(computeTrend(daysOfWeights("2026-06-01", [80]))),
    ).toBeNull();
  });

  it("measures a steady loss", () => {
    // 100g/day loss for 14 days = 0.7 kg/week; use pre-smoothed data by
    // feeding a long series so the EMA converges to the same slope.
    const weightsKg = Array.from({ length: 60 }, (_, i) => 85 - i * 0.1);
    const trend = computeTrend(daysOfWeights("2026-04-01", weightsKg));
    const rate = computeRateKgPerWeek(trend);
    expect(rate).not.toBeNull();
    expect(rate!).toBeLessThan(-0.6);
    expect(rate!).toBeGreaterThan(-0.8);
  });

  it("reports ~zero for stable weight", () => {
    const weightsKg = Array.from({ length: 30 }, () => 80);
    const trend = computeTrend(daysOfWeights("2026-05-01", weightsKg));
    expect(computeRateKgPerWeek(trend)).toBeCloseTo(0, 5);
  });
});

describe("computeEnergyBalance", () => {
  it("returns null without enough trend points", () => {
    expect(computeEnergyBalance([], [])).toBeNull();
  });

  it("returns null when no days were logged in the window", () => {
    const trend = computeTrend(
      daysOfWeights("2026-06-01", [80, 80, 80, 80, 80]),
    );
    expect(computeEnergyBalance(trend, [])).toBeNull();
  });

  it("TDEE equals intake when weight is flat", () => {
    const weightsKg = Array.from({ length: 20 }, () => 80);
    const trend = computeTrend(daysOfWeights("2026-06-01", weightsKg));
    const intake = daysOfIntake(
      "2026-06-01",
      Array.from({ length: 20 }, () => 2200),
    );
    const balance = computeEnergyBalance(trend, intake);
    expect(balance).not.toBeNull();
    expect(balance!.tdeeKcal).toBe(2200);
    expect(balance!.actualDeficitKcal).toBe(0);
  });

  it("losing weight puts TDEE above intake", () => {
    // Converged steady loss of 0.1 kg/day ⇒ deficit ≈ 770 kcal/day
    const weightsKg = Array.from({ length: 60 }, (_, i) => 90 - i * 0.1);
    const trend = computeTrend(daysOfWeights("2026-04-01", weightsKg));
    const intake = daysOfIntake(
      "2026-04-01",
      Array.from({ length: 60 }, () => 2000),
    );
    const balance = computeEnergyBalance(trend, intake);
    expect(balance).not.toBeNull();
    expect(balance!.actualDeficitKcal).toBeGreaterThan(600);
    expect(balance!.actualDeficitKcal).toBeLessThan(900);
    expect(balance!.tdeeKcal).toBe(2000 + balance!.actualDeficitKcal);
  });

  it("excludes zero-calorie days from the intake average", () => {
    const weightsKg = Array.from({ length: 20 }, () => 80);
    const trend = computeTrend(daysOfWeights("2026-06-01", weightsKg));
    const calories = Array.from({ length: 20 }, (_, i) =>
      i % 2 === 0 ? 2000 : 0,
    );
    const intake = daysOfIntake("2026-06-01", calories);
    const balance = computeEnergyBalance(trend, intake);
    expect(balance).not.toBeNull();
    expect(balance!.avgIntakeKcal).toBe(2000); // zero days not averaged in
  });
});

describe("computeVerdict", () => {
  function convergedScenario(dailyIntake: number, dailyLossKg: number) {
    const weightsKg = Array.from({ length: 60 }, (_, i) => 90 - i * dailyLossKg);
    const trend = computeTrend(daysOfWeights("2026-04-01", weightsKg));
    const intake = daysOfIntake(
      "2026-04-01",
      Array.from({ length: 60 }, () => dailyIntake),
    );
    const balance = computeEnergyBalance(trend, intake);
    return { trend, balance };
  }

  it("is collecting with sparse data", () => {
    const trend = computeTrend(daysOfWeights("2026-06-01", [80, 79.9]));
    const verdict = computeVerdict(null, trend, -0.5);
    expect(verdict.status).toBe("collecting");
    expect(verdict.missing.length).toBeGreaterThan(0);
  });

  it("is on_track when actual deficit matches the target rate", () => {
    // Losing ~0.07 kg/day ≈ 0.49 kg/wk vs target 0.5 kg/wk
    const { trend, balance } = convergedScenario(2000, 0.07);
    const verdict = computeVerdict(balance, trend, -0.5);
    expect(verdict.status).toBe("on_track");
  });

  it("says eat less when the deficit is too small", () => {
    // Flat weight but target is to lose 0.5 kg/wk (needs ~550 kcal deficit)
    const { trend, balance } = convergedScenario(2200, 0);
    const verdict = computeVerdict(balance, trend, -0.5);
    expect(verdict.status).toBe("adjust");
    expect(verdict.adjustKcal).toBeGreaterThan(400); // eat ~550 less
  });

  it("says eat more when losing too fast", () => {
    // Losing 0.15 kg/day (~1 kg/wk) against a 0.25 kg/wk target
    const { trend, balance } = convergedScenario(1600, 0.15);
    const verdict = computeVerdict(balance, trend, -0.25);
    expect(verdict.status).toBe("adjust");
    expect(verdict.adjustKcal).toBeLessThan(0); // negative = eat more
  });

  it("supports gaining goals", () => {
    // Gaining 0.035 kg/day ≈ +0.25 kg/wk, matching a +0.25 target
    const weightsKg = Array.from({ length: 60 }, (_, i) => 70 + i * 0.035);
    const trend = computeTrend(daysOfWeights("2026-04-01", weightsKg));
    const intake = daysOfIntake(
      "2026-04-01",
      Array.from({ length: 60 }, () => 2800),
    );
    const balance = computeEnergyBalance(trend, intake);
    const verdict = computeVerdict(balance, trend, 0.25);
    expect(verdict.status).toBe("on_track");
  });
});
