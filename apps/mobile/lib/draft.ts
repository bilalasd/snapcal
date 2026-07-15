import type { MealDraft } from "@loggi/shared";

// Hand-off between "Log again" and the Add screen. In-memory is fine — it's an
// immediate same-session navigation. ponytail: AsyncStorage persistence in
// Phase 5 if we want drafts to survive an app restart.
let pending: MealDraft | null = null;

export function stashDraft(draft: MealDraft) {
  pending = draft;
}

export function popDraft(): MealDraft | null {
  const d = pending;
  pending = null;
  return d;
}
