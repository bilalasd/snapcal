import { describe, expect, it } from "vitest";
import { addMealHref } from "./nav";

describe("addMealHref", () => {
  it("logs to the viewed past day on Today", () => {
    expect(addMealHref("/", "2026-07-08")).toBe("/add?date=2026-07-08");
  });

  it("logs to today when no date is set", () => {
    expect(addMealHref("/", null)).toBe("/add");
  });

  it("ignores the date param off the Today screen", () => {
    expect(addMealHref("/history", "2026-07-08")).toBe("/add");
  });

  it("ignores a malformed date", () => {
    expect(addMealHref("/", "not-a-date")).toBe("/add");
  });
});
