import type { ApiMeal, DraftPhoto } from "@loggi/shared";
import { fetchJson, uploadPhoto, isNetworkError } from "./api";
import { addOptimisticMeal, settleMeal, discardOptimistic } from "./cache";
import { readJson, writeJson } from "./disk";

// Offline save queue: a meal save that fails at the transport level keeps its
// optimistic UI and lands here instead of being discarded — the log never
// dead-ends on a dead network (PRODUCT.md principle 6). Flushed on app start,
// on foreground, and after the next successful save attempt.
// ponytail: a photo uploaded on an attempt whose POST then failed is uploaded
// again next flush — an orphaned blob beats a lost meal.

export interface QueuedSave {
  id: string; // the optimistic meal id
  meal: ApiMeal; // stand-in, resurrected into caches on relaunch
  body: Record<string, unknown>; // POST /api/meals body (photos: already-uploaded DraftPhotos)
  photoUris: string[]; // local photos still to upload before the POST
}

const FILE = "save-queue.json";
let queue: QueuedSave[] = [];
let hydrated = false;
let flushing = false;

// The offline banner watches the queue length.
const listeners = new Set<(count: number) => void>();
const notify = () => listeners.forEach((fn) => fn(queue.length));
export function subscribeQueue(fn: (count: number) => void): () => void {
  listeners.add(fn);
  fn(queue.length);
  return () => listeners.delete(fn);
}

const persist = () => {
  notify();
  return writeJson(FILE, queue);
};

/** App start: reload pending saves, show their meals, try to send them. */
export async function hydrateQueue() {
  if (hydrated) return;
  hydrated = true;
  queue = (await readJson<QueuedSave[]>(FILE)) ?? [];
  notify();
  for (const q of queue) addOptimisticMeal(q.meal);
  if (queue.length) void flushQueue();
}

export function queueMealSave(entry: QueuedSave) {
  queue.push(entry);
  void persist();
}

/** Sends queued saves in order. Stops at the first transport failure (still
 *  offline); drops entries the server actually rejected. */
export async function flushQueue() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  try {
    while (queue.length > 0) {
      const q = queue[0];
      try {
        const uploaded: DraftPhoto[] = [];
        for (const uri of q.photoUris) uploaded.push(await uploadPhoto(uri));
        const prior = (q.body.photos as DraftPhoto[] | undefined) ?? [];
        await fetchJson("/api/meals", {
          method: "POST",
          body: JSON.stringify({ ...q.body, photos: [...prior, ...uploaded] }),
        });
        settleMeal(q.id);
      } catch (err) {
        if (isNetworkError(err)) return; // still offline — keep everything, retry later
        discardOptimistic(q.id); // the server said no — a retry won't change that
      }
      queue.shift();
      void persist();
    }
  } finally {
    flushing = false;
  }
}
