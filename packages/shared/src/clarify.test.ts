import { describe, expect, it } from "vitest";
import { resolveAnswers, type ClarifyAnswer } from "./clarify";
import type { DraftItem } from "./client";

const item: DraftItem = {
  name: "Beef patty",
  portion: "1 patty",
  calories: 290,
  protein_g: 20,
  carbs_g: 0,
  fat_g: 23,
};

describe("resolveAnswers", () => {
  it("no call when everything is skipped", () => {
    const res = resolveAnswers([{ kind: "skip" }, { kind: "skip" }]);
    expect(res.items).toBeUndefined();
    expect(res.refineText).toBeUndefined();
  });

  it("applies items directly for a single tapped option", () => {
    const answers: ClarifyAnswer[] = [
      { kind: "option", question: "Meat?", label: "Beef", items: [item] },
    ];
    const res = resolveAnswers(answers);
    expect(res.items).toEqual([item]);
    expect(res.refineText).toBeUndefined();
  });

  it("needs a call for a single typed answer", () => {
    const res = resolveAnswers([
      { kind: "text", question: "Sauce?", text: "extra mayo" },
    ]);
    expect(res.items).toBeUndefined();
    expect(res.refineText).toBe("Sauce?: extra mayo");
  });

  it("needs a call combining multiple answers, skipping skips", () => {
    const res = resolveAnswers([
      { kind: "option", question: "Meat?", label: "Beef", items: [item] },
      { kind: "text", question: "Oil?", text: "none" },
      { kind: "skip" },
    ]);
    expect(res.items).toBeUndefined();
    expect(res.refineText).toBe("Meat?: Beef. Oil?: none");
  });
});
