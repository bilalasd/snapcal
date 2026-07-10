"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Camera, HelpCircle, Mic, MicOff, Search, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { AnalyzingOverlay } from "@/components/analyzing-overlay";
import { MealReview } from "@/components/meal-review";
import { MealListItem } from "@/components/meal-list-item";
import { FoodSearchDrawer } from "@/components/food-search-drawer";
import { NutritionFacts } from "@/components/nutrition-facts";
import { PhotoStrip } from "@/components/photo-strip";
import { resizeImage, type EncodedImage } from "@/lib/resize-image";
import { cn } from "@/lib/utils";
import {
  fetchJson,
  itemsToDraft,
  mealTotals,
  popDraft,
  type ApiMeal,
  type DraftItem,
  type DraftPhoto,
  type MealDraft,
} from "@/lib/client";

interface Photo {
  encoded: EncodedImage;
  previewUrl: string;
}

// Minimal typing for the vendor-prefixed Web Speech API
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export default function AddMealPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [favorites, setFavorites] = useState<ApiMeal[]>([]);
  const [recent, setRecent] = useState<ApiMeal[]>([]);
  const [search, setSearch] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [targetDate, setTargetDate] = useState<string | null>(null); // YYYY-MM-DD, null = today
  const [refineText, setRefineText] = useState(""); // extra details for re-analysis
  const [draft, setDraft] = useState<{
    name: string;
    items: DraftItem[];
    source: MealDraft["source"];
    photos: DraftPhoto[];
    question?: string;
    choices?: string[];
  } | null>(null);

  useEffect(() => {
    // Draft handed over from "log again" on the History screen.
    // Must run post-mount: sessionStorage isn't available during prerender,
    // and reading it in a state initializer would cause a hydration mismatch.
    const stashed = popDraft();
    if (stashed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft({
        name: stashed.name,
        items: stashed.items,
        source: stashed.source,
        photos: stashed.photos ?? [],
        question: stashed.question || undefined,
        choices: stashed.choices?.length ? stashed.choices : undefined,
      });
    }
    fetchJson<ApiMeal[]>("/api/meals?favorites=true")
      .then(setFavorites)
      .catch(() => {});
    fetchJson<ApiMeal[]>("/api/meals?recent=true").then(setRecent).catch(() => {});
    const urlDate = new URLSearchParams(window.location.search).get("date");
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) setTargetDate(urlDate);
    const w = window as unknown as Record<string, unknown>;
    setSpeechSupported(
      Boolean(w.SpeechRecognition || w.webkitSpeechRecognition),
    );
  }, []);

  useEffect(() => {
    const q = search.trim();
    const handle = setTimeout(() => {
      fetchJson<ApiMeal[]>(
        `/api/meals?recent=true${q ? `&q=${encodeURIComponent(q)}` : ""}`,
      )
        .then(setRecent)
        .catch(() => {});
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  async function onFilesSelected(files: FileList | null) {
    if (!files) return;
    const remaining = 3 - photos.length;
    const selected = Array.from(files).slice(0, remaining);
    try {
      const encoded = await Promise.all(
        selected.map(async (file) => ({
          encoded: await resizeImage(file),
          previewUrl: URL.createObjectURL(file),
        })),
      );
      setPhotos((prev) => [...prev, ...encoded]);
    } catch {
      toast.error("Couldn't read that photo");
    }
  }

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (event) => {
      const transcript = Array.from(
        { length: event.results.length },
        (_, i) => event.results[i][0].transcript,
      ).join(" ");
      setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  /** Upload the selected photos to Blob, return their stored URLs. */
  async function uploadPhotos(): Promise<DraftPhoto[]> {
    const uploaded: DraftPhoto[] = [];
    for (const photo of photos) {
      const bytes = Uint8Array.from(atob(photo.encoded.data), (c) =>
        c.charCodeAt(0),
      );
      const res = await fetch("/api/photos", {
        method: "POST",
        headers: { "Content-Type": photo.encoded.media_type },
        body: bytes,
      });
      if (res.ok) uploaded.push(await res.json());
    }
    return uploaded;
  }

  async function runAnalysis(fullText: string) {
    setAnalyzing(true);
    try {
      const result = await fetchJson<{
        meal_name: string;
        items: DraftItem[];
        question?: string;
        choices?: string[];
      }>("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: photos.map((p) => p.encoded),
          text: fullText,
        }),
      });
      setDraft({
        name: result.meal_name,
        items: result.items,
        source: photos.length > 0 ? "photo" : "text",
        photos: [],
        question: result.question || undefined,
        choices: result.choices?.length ? result.choices : undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  function analyze() {
    runAnalysis(text);
  }

  // Fold extra details into the description and analyze the same photos again.
  // Used by both the free-text correction note and the tappable answer chips.
  function applyRefinement(extra: string) {
    const trimmed = extra.trim();
    if (!trimmed) return;
    const combined = [text, trimmed].filter((s) => s.trim()).join(". ");
    setText(combined);
    setRefineText("");
    runAnalysis(combined);
  }

  function reanalyze() {
    applyRefinement(refineText);
  }

  function logExisting(meal: ApiMeal, source: "favorite" | "copy") {
    setDraft({
      name: meal.name,
      source,
      items: itemsToDraft(meal),
      // Reuse the same stored blob URLs — no re-upload needed
      photos: meal.photos.map((p) => ({ url: p.url, pathname: p.pathname })),
    });
  }

  async function save() {
    if (!draft) return;
    const items = draft.items.filter((i) => i.name.trim());
    if (items.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    setSaving(true);
    try {
      // Photos captured this session need uploading; reused ones already have URLs
      const captured = photos.length > 0 ? await uploadPhotos() : [];
      const mealPhotos = [...draft.photos, ...captured];
      // Past days log at local noon so they land on the right calendar date;
      // today logs at the current time.
      const eatenAt = targetDate
        ? new Date(`${targetDate}T12:00:00`).toISOString()
        : new Date().toISOString();
      await fetchJson("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name || "Meal",
          eaten_at: eatenAt,
          note: text || undefined,
          source: draft.source,
          items,
          photos: mealPhotos,
        }),
      });
      toast.success(targetDate ? "Meal added" : "Meal logged");
      router.push(targetDate ? "/" : "/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  if (draft) {
    const draftPhotoUrls = [
      ...draft.photos.map((p) => p.url),
      ...photos.map((p) => p.previewUrl),
    ];
    const canReanalyze =
      photos.length > 0 || draft.source === "photo" || draft.source === "text";
    return (
      <div className="flex flex-col gap-5">
        {analyzing ? <AnalyzingOverlay photoUrl={draftPhotoUrls[0]} /> : null}
        <section>
          <p className="editorial-kicker">AI readback</p>
          <h1 className="editorial-headline mt-1">Review the plate</h1>
        </section>
        {draftPhotoUrls.length > 0 ? (
          <div className="editorial-card editorial-cut p-3">
            <PhotoStrip urls={draftPhotoUrls} />
          </div>
        ) : null}

        {draft.question ? (
          <div className="editorial-card editorial-cut border-2 border-primary/60 bg-primary/5 p-4">
            <p className="editorial-kicker flex items-center gap-1.5 text-primary-strong">
              <HelpCircle className="size-4" /> Quick question
            </p>
            <p className="mt-1.5 text-lg font-black tracking-[-0.03em]">
              {draft.question}
            </p>
            {draft.choices?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {draft.choices.map((choice) => (
                  <Button
                    key={choice}
                    variant="outline"
                    disabled={analyzing}
                    onClick={() => applyRefinement(choice)}
                  >
                    {choice}
                  </Button>
                ))}
              </div>
            ) : null}
            <div className="relative mt-3">
              <Textarea
                placeholder={
                  draft.choices?.length
                    ? "…or type your own answer"
                    : "Type your answer…"
                }
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                rows={2}
                disabled={analyzing}
                className="bg-card"
              />
              <Button
                size="sm"
                className="absolute bottom-2 right-2"
                onClick={reanalyze}
                disabled={analyzing || !refineText.trim()}
              >
                {analyzing ? <Spinner data-icon="inline-start" /> : null}
                Send
              </Button>
            </div>
          </div>
        ) : null}

        <MealReview
          name={draft.name}
          onNameChange={(name) => setDraft({ ...draft, name })}
          items={draft.items}
          onItemsChange={(items) => setDraft({ ...draft, items })}
        />

        {canReanalyze && !draft.question ? (
          <div className="editorial-card editorial-cut relative p-3">
            <p className="editorial-kicker mb-2">Correction note</p>
            <Textarea
              placeholder={
                draft.question
                  ? "Answer the question, or add any details…"
                  : "Not quite right? Add details and re-analyze…"
              }
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
              rows={2}
              disabled={analyzing}
            />
            <Button
              size="sm"
              className="absolute bottom-2 right-2"
              onClick={reanalyze}
              disabled={analyzing || !refineText.trim()}
            >
              {analyzing ? <Spinner data-icon="inline-start" /> : null}
              Re-analyze
            </Button>
          </div>
        ) : null}

        <FoodSearchDrawer
          onAdd={(item) =>
            setDraft({ ...draft, items: [...draft.items, item] })
          }
        />
        <NutritionFacts items={draft.items} />
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setDraft(null)}
            disabled={saving}
          >
            Back
          </Button>
          <Button className="flex-1" onClick={save} disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Save
          </Button>
        </div>
      </div>
    );
  }

  const canAnalyze = photos.length > 0 || text.trim().length > 0;

  // The recent list comes back newest-first with the same meal logged many
  // times; collapse to one card per distinct name and cap it so it stays a
  // quick-pick shortcut, not an endless scroll.
  const recentUnique = Array.from(
    new Map(recent.map((m) => [m.name.toLowerCase(), m])).values(),
  ).slice(0, 12);

  return (
    <div className="flex flex-col gap-4">
      {analyzing ? (
        <AnalyzingOverlay photoUrl={photos[0]?.previewUrl} />
      ) : null}
      <section>
        <p className="editorial-kicker">Camera first</p>
        <h1 className="editorial-headline mt-1">Log a meal</h1>
      </section>
      {targetDate ? (
        <p className="editorial-card -mt-2 rounded-sm px-3 py-2 text-sm">
          Adding to{" "}
          <span className="font-semibold">
            {new Date(`${targetDate}T12:00:00`).toLocaleDateString([], {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </span>
        </p>
      ) : null}

      {favorites.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-y border-foreground/15 py-3">
          {favorites.map((meal) => {
            const totals = mealTotals(meal);
            return (
              <button
                key={meal.id}
                onClick={() => logExisting(meal, "favorite")}
              >
                <Badge variant="secondary" className="cursor-pointer rounded-sm py-1.5">
                  <Star data-icon="inline-start" />
                  {meal.name} · {totals.calories} kcal
                </Badge>
              </button>
            );
          })}
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onFilesSelected(e.target.files);
          e.target.value = "";
        }}
      />

      {photos.length > 0 ? (
        <div className="flex gap-3">
          {photos.map((photo, index) => (
            <div
              key={index}
              className={cn(
                "photo-frame relative h-28 w-24",
                index % 2 === 0 ? "-rotate-2" : "rotate-2",
              )}
            >
              <Image
                src={photo.previewUrl}
                alt={`Photo ${index + 1}`}
                width={112}
                height={132}
                unoptimized
                className="size-full object-cover"
              />
              <button
                aria-label="Remove photo"
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background after:absolute after:-inset-3 after:content-['']"
                onClick={() => {
                  URL.revokeObjectURL(photo.previewUrl);
                  setPhotos(photos.filter((_, i) => i !== index));
                }}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {photos.length < 3 ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="editorial-card editorial-cut flex h-44 flex-col items-center justify-center gap-3 border-2 border-dashed border-primary/45 text-accent-foreground transition-colors active:bg-accent"
        >
          <span className="flex size-16 items-center justify-center rounded-none bg-primary text-primary-foreground">
            <Camera className="size-6" />
          </span>
          <span className="text-center text-xl font-black tracking-[-0.05em]">
            {photos.length === 0
              ? "Snap or choose photos"
              : "Add another photo"}
          </span>
          <span className="editorial-kicker">Up to 3 angles</span>
        </button>
      ) : null}

      <div className="editorial-card editorial-cut relative p-3">
        <p className="editorial-kicker mb-2">Context note</p>
        <Textarea
          placeholder='Optional details, e.g. "2 rotis, dal, no butter"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
        />
        {speechSupported ? (
          <Button
            type="button"
            variant={listening ? "default" : "outline"}
            size="icon"
            aria-label={listening ? "Stop dictation" : "Dictate"}
            className="absolute bottom-2 right-2 rounded-full"
            onClick={toggleMic}
          >
            {listening ? <MicOff /> : <Mic />}
          </Button>
        ) : null}
      </div>

      <Button size="lg" onClick={analyze} disabled={!canAnalyze || analyzing}>
        {analyzing ? <Spinner data-icon="inline-start" /> : null}
        {analyzing ? "Analyzing…" : "Analyze"}
      </Button>

      <FoodSearchDrawer
        onAdd={(item) =>
          setDraft({
            name: item.name,
            items: [item],
            source: "text",
            photos: [],
          })
        }
      />

      <div className="mt-2 flex flex-col gap-3 border-t border-foreground/15 pt-4">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search your meals"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {recentUnique.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-muted-foreground text-sm font-medium">
              {search.trim() ? "Results" : "Recent meals"}
            </h2>
            {recentUnique.map((meal) => (
              <MealListItem
                key={meal.id}
                meal={meal}
                onClick={() => logExisting(meal, "copy")}
              />
            ))}
          </div>
        ) : search.trim() ? (
          <p className="text-muted-foreground text-sm">No meals found.</p>
        ) : null}
      </div>
    </div>
  );
}
