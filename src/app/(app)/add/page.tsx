"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Camera, Mic, MicOff, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { MealReview } from "@/components/meal-review";
import { resizeImage, type EncodedImage } from "@/lib/resize-image";
import {
  fetchJson,
  mealTotals,
  popDraft,
  type ApiMeal,
  type DraftItem,
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
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<{
    name: string;
    items: DraftItem[];
    source: MealDraft["source"];
  } | null>(null);

  useEffect(() => {
    // Draft handed over from "log again" on the History screen
    const stashed = popDraft();
    if (stashed) {
      setDraft({
        name: stashed.name,
        items: stashed.items,
        source: stashed.source,
      });
    }
    fetchJson<ApiMeal[]>("/api/meals?favorites=true")
      .then(setFavorites)
      .catch(() => {});
    const w = window as unknown as Record<string, unknown>;
    setSpeechSupported(
      Boolean(w.SpeechRecognition || w.webkitSpeechRecognition),
    );
  }, []);

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

  async function analyze() {
    setAnalyzing(true);
    try {
      const result = await fetchJson<{ meal_name: string; items: DraftItem[] }>(
        "/api/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            images: photos.map((p) => p.encoded),
            text,
          }),
        },
      );
      setDraft({
        name: result.meal_name,
        items: result.items,
        source: photos.length > 0 ? "photo" : "text",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed", {
        action: { label: "Retry", onClick: analyze },
      });
    } finally {
      setAnalyzing(false);
    }
  }

  function logFavorite(meal: ApiMeal) {
    setDraft({
      name: meal.name,
      source: "favorite",
      items: meal.items.map((item) => ({
        name: item.name,
        portion: item.portion,
        calories: item.calories,
        protein_g: Number(item.proteinG),
        carbs_g: Number(item.carbsG),
        fat_g: Number(item.fatG),
      })),
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
      await fetchJson("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name || "Meal",
          eaten_at: new Date().toISOString(),
          note: text || undefined,
          source: draft.source,
          items,
        }),
      });
      toast.success("Meal logged");
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  if (draft) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Review</h1>
        <MealReview
          name={draft.name}
          onNameChange={(name) => setDraft({ ...draft, name })}
          items={draft.items}
          onItemsChange={(items) => setDraft({ ...draft, items })}
        />
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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Log a meal</h1>

      {favorites.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {favorites.map((meal) => {
            const totals = mealTotals(meal);
            return (
              <button key={meal.id} onClick={() => logFavorite(meal)}>
                <Badge variant="secondary" className="cursor-pointer py-1.5">
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
        <div className="flex gap-2">
          {photos.map((photo, index) => (
            <div key={index} className="relative">
              <Image
                src={photo.previewUrl}
                alt={`Photo ${index + 1}`}
                width={96}
                height={96}
                unoptimized
                className="size-24 rounded-lg object-cover"
              />
              <button
                aria-label="Remove photo"
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background"
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
        <Button
          variant="outline"
          className="h-24 border-dashed"
          onClick={() => fileInputRef.current?.click()}
        >
          <Camera data-icon="inline-start" />
          {photos.length === 0 ? "Take / choose photos" : "Add another photo"}
        </Button>
      ) : null}

      <div className="relative">
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
    </div>
  );
}
