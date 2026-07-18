import type { MealDraft } from "@loggi/shared";
import { readJson, writeJson, removeFile } from "./disk";

const DRAFT_FILE = "pending-draft.json";

// Hand-off between "Log again" and the Add screen — in-memory for the
// immediate same-session navigation, mirrored to disk as a crash net: the Add
// screen persists its live review draft while open and clears it on normal
// unmount, so only a crash/kill leaves a file behind. hydrateDraft() at app
// start turns that file back into a stashed draft, and the next visit to Add
// resumes the review instead of losing the meal.
let pending: MealDraft | null = null;

export function stashDraft(draft: MealDraft) {
  pending = draft;
}

export function popDraft(): MealDraft | null {
  const d = pending;
  pending = null;
  return d;
}

/** App start: a leftover draft file means the last session died mid-review. */
export async function hydrateDraft() {
  if (pending) return;
  const saved = await readJson<MealDraft>(DRAFT_FILE);
  if (saved) pending = saved;
  await removeFile(DRAFT_FILE);
}

/** Add screen, while a review draft is open: keep the crash net current. */
export function persistDraft(draft: MealDraft) {
  void writeJson(DRAFT_FILE, draft);
}

/** Add screen, on save or normal close: the net is no longer needed. */
export function clearPersistedDraft() {
  void removeFile(DRAFT_FILE);
}

// Same hand-off pattern for the speed dial's hold-to-talk: the tab bar
// transcribes while the mic is held, then passes the words to /add.
let pendingTranscript: string | null = null;

export function stashTranscript(text: string) {
  pendingTranscript = text;
}

export function popTranscript(): string | null {
  const t = pendingTranscript;
  pendingTranscript = null;
  return t;
}
