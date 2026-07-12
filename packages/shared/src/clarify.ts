import type { DraftItem } from "./types";

/** A user's answer to one clarifying question on the question step. */
export type ClarifyAnswer =
  | { kind: "option"; question: string; label: string; items: DraftItem[] }
  | { kind: "text"; question: string; text: string }
  | { kind: "skip" };

export interface Resolution {
  // Set when the answers can be applied with no AI call: use these items.
  items?: DraftItem[];
  // Set when a consolidated re-analysis is needed: fold this into the description.
  refineText?: string;
}

/**
 * Decide what to do once every question has an answer.
 *
 * - Nothing answered (all skipped) -> keep the best-guess items, no call.
 * - Exactly one tapped option -> apply its precomputed items, no call.
 * - Anything else (multiple answers, or any typed answer) -> one consolidated
 *   AI call, since precomputed per-option meals can't be composed together.
 */
export function resolveAnswers(answers: ClarifyAnswer[]): Resolution {
  const answered = answers.filter((a) => a.kind !== "skip");
  if (answered.length === 0) return {};
  if (answered.length === 1 && answered[0].kind === "option") {
    return { items: answered[0].items };
  }
  const refineText = answered
    .map((a) =>
      a.kind === "option"
        ? `${a.question}: ${a.label}`
        : a.kind === "text"
          ? `${a.question}: ${a.text}`
          : "",
    )
    .filter(Boolean)
    .join(". ");
  return { refineText };
}
