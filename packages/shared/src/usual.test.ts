import { describe, expect, it } from "vitest";
import { bucketOfHour, pickUsual, type UsualCandidate } from "./usual";

// Noon UTC, tz 0 → midday bucket.
const NOW = new Date("2026-07-15T12:00:00Z");

let seq = 0;
function meal(name: string, eatenAt: string): UsualCandidate {
  return { id: `m${seq++}`, name, eatenAt };
}

/** n midday occurrences of `name` on distinct past days. */
function middayRun(name: string, n: number): UsualCandidate[] {
  return Array.from({ length: n }, (_, i) =>
    meal(name, `2026-07-${String(14 - i).padStart(2, "0")}T12:30:00Z`),
  );
}

describe("bucketOfHour", () => {
  it("maps boundaries correctly", () => {
    expect(bucketOfHour(3)).toBe("night");
    expect(bucketOfHour(4)).toBe("morning");
    expect(bucketOfHour(10)).toBe("morning");
    expect(bucketOfHour(11)).toBe("midday");
    expect(bucketOfHour(15)).toBe("midday");
    expect(bucketOfHour(16)).toBe("evening");
    expect(bucketOfHour(21)).toBe("evening");
    expect(bucketOfHour(22)).toBe("night");
  });
});

describe("pickUsual", () => {
  it("suggests a meal logged 3+ times in the current bucket", () => {
    const meals = middayRun("Chicken wrap", 3);
    expect(pickUsual(meals, NOW, 0)).toBe(meals[0].id); // most recent of the run
  });

  it("ignores meals with fewer than 3 occurrences", () => {
    expect(pickUsual(middayRun("Chicken wrap", 2), NOW, 0)).toBeNull();
  });

  it("ignores occurrences from other buckets", () => {
    const breakfasts = Array.from({ length: 5 }, (_, i) =>
      meal("Oats", `2026-07-${String(14 - i).padStart(2, "0")}T07:00:00Z`),
    );
    expect(pickUsual(breakfasts, NOW, 0)).toBeNull();
  });

  it("matches names case-insensitively and trimmed", () => {
    const meals = [
      meal("chicken wrap ", "2026-07-14T12:30:00Z"),
      meal("Chicken Wrap", "2026-07-13T12:30:00Z"),
      meal("CHICKEN WRAP", "2026-07-12T12:30:00Z"),
    ];
    expect(pickUsual(meals, NOW, 0)).toBe(meals[0].id);
  });

  it("skips a usual already logged today, even in another bucket", () => {
    const meals = [...middayRun("Chicken wrap", 3), meal("Chicken wrap", "2026-07-15T07:00:00Z")];
    expect(pickUsual(meals, NOW, 0)).toBeNull();
  });

  it("prefers the more frequent group, breaking ties by recency", () => {
    const often = middayRun("Rice bowl", 4);
    const lessOften = middayRun("Chicken wrap", 3);
    expect(pickUsual([...often, ...lessOften], NOW, 0)).toBe(often[0].id);

    const stale = Array.from({ length: 3 }, (_, i) =>
      meal("Old salad", `2026-06-${String(20 - i).padStart(2, "0")}T12:30:00Z`),
    );
    expect(pickUsual([...stale, ...lessOften], NOW, 0)).toBe(lessOften[0].id);
  });

  it("respects the timezone offset when bucketing", () => {
    // 09:30 UTC is morning at tz 0 but 11:30 local at tz_offset -120 (UTC+2),
    // which lands in NOW's midday bucket.
    const meals = Array.from({ length: 3 }, (_, i) =>
      meal("Oats", `2026-07-${String(14 - i).padStart(2, "0")}T09:30:00Z`),
    );
    expect(pickUsual(meals, NOW, -120)).toBe(meals[0].id);
    expect(pickUsual(meals, NOW, 0)).toBeNull();
  });
});
