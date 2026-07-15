import { useEffect, useState } from "react";
import { View, Text, ScrollView, Image, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import {
  itemsToDraft,
  mealTotals,
  resolveAnswers,
  type ApiMeal,
  type ClarifyAnswer,
  type ClarifyQuestion,
  type DraftItem,
  type DraftPhoto,
  type MealDraft,
} from "@mealio/shared";
import { fetchJson, uploadPhoto } from "../lib/api";
import { tapSuccess } from "../lib/haptics";
import { popDraft } from "../lib/draft";
import { takePhoto, pickPhotos, type PickedPhoto } from "../lib/image";
import { lookupBarcode } from "../lib/barcode";
import { BarcodeScanner } from "../components/barcode-scanner";
import { Button, Card, Input, Kicker, Spinner } from "../components/ui";
import { AnalyzingOverlay } from "../components/analyzing-overlay";
import { QuestionsStep } from "../components/questions-step";
import { MealReview } from "../components/meal-review";
import { MealListItem } from "../components/meal-list-item";
import { NutritionFacts } from "../components/nutrition-facts";

interface Draft {
  name: string;
  items: DraftItem[];
  source: MealDraft["source"];
  photos: DraftPhoto[];
  questions?: ClarifyQuestion[];
}

export default function Add() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const targetDate = params.date ?? null;

  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [text, setText] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [favorites, setFavorites] = useState<ApiMeal[]>([]);
  const [recent, setRecent] = useState<ApiMeal[]>([]);
  const [search, setSearch] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refineText, setRefineText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);

  async function onScanned(code: string) {
    setScanBusy(true);
    try {
      const item = await lookupBarcode(code);
      if (!item) {
        Alert.alert("Not found", "That barcode isn't in the database. Try a photo instead.");
        setScanBusy(false);
        return;
      }
      setScanOpen(false);
      setScanBusy(false);
      setDraft({ name: item.name, items: [item], source: "text", photos: [] });
    } catch {
      setScanBusy(false);
      Alert.alert("Lookup failed", "Try again, or use a photo.");
    }
  }

  useEffect(() => {
    const stashed = popDraft();
    if (stashed) {
      setDraft({
        name: stashed.name,
        items: stashed.items,
        source: stashed.source,
        photos: stashed.photos ?? [],
        questions: stashed.questions?.length ? stashed.questions : undefined,
      });
    }
    fetchJson<ApiMeal[]>("/api/meals?favorites=true").then(setFavorites).catch(() => {});
    fetchJson<ApiMeal[]>("/api/meals?recent=true").then(setRecent).catch(() => {});
  }, []);

  useEffect(() => {
    const q = search.trim();
    const handle = setTimeout(() => {
      fetchJson<ApiMeal[]>(`/api/meals?recent=true${q ? `&q=${encodeURIComponent(q)}` : ""}`)
        .then(setRecent)
        .catch(() => {});
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  async function addFromCamera() {
    const p = await takePhoto();
    if (p) setPhotos((prev) => [...prev, p].slice(0, 3));
  }
  async function addFromLibrary() {
    const picked = await pickPhotos(3 - photos.length);
    if (picked.length) setPhotos((prev) => [...prev, ...picked].slice(0, 3));
  }

  async function runAnalysis(fullText: string, opts?: { suppressQuestions?: boolean }) {
    setAnalyzing(true);
    try {
      const result = await fetchJson<{ meal_name: string; items: DraftItem[]; questions?: ClarifyQuestion[] }>("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ images: photos.map((p) => p.encoded), text: fullText }),
      });
      setDraft({
        name: result.meal_name,
        items: result.items,
        source: photos.length > 0 ? "photo" : "text",
        photos: [],
        questions: opts?.suppressQuestions ? undefined : result.questions?.length ? result.questions : undefined,
      });
    } catch (err) {
      Alert.alert(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  function reanalyze() {
    const trimmed = refineText.trim();
    if (!trimmed) return;
    const combined = [text, trimmed].filter((s) => s.trim()).join(". ");
    setText(combined);
    setRefineText("");
    runAnalysis(combined);
  }

  function handleAnswers(answers: ClarifyAnswer[]) {
    if (!draft) return;
    const { items, refineText: extra } = resolveAnswers(answers);
    if (items) {
      setDraft({ ...draft, items, questions: undefined });
    } else if (extra) {
      const combined = [text, extra].filter((s) => s.trim()).join(". ");
      setText(combined);
      setDraft({ ...draft, questions: undefined });
      runAnalysis(combined, { suppressQuestions: true });
    } else {
      setDraft({ ...draft, questions: undefined });
    }
  }

  function logExisting(meal: ApiMeal, source: "favorite" | "copy") {
    setDraft({
      name: meal.name,
      source,
      items: itemsToDraft(meal),
      photos: meal.photos.map((p) => ({ url: p.url, pathname: p.pathname })),
    });
  }

  async function quickLog(meal: ApiMeal) {
    const items = itemsToDraft(meal).filter((i) => i.name.trim());
    if (items.length === 0) return;
    const eatenAt = targetDate ? new Date(`${targetDate}T12:00:00`).toISOString() : new Date().toISOString();
    try {
      await fetchJson("/api/meals", {
        method: "POST",
        body: JSON.stringify({
          name: meal.name || "Meal",
          eaten_at: eatenAt,
          source: "copy",
          items,
          photos: meal.photos.map((p) => ({ url: p.url, pathname: p.pathname })),
        }),
      });
      tapSuccess();
      router.replace("/");
    } catch (err) {
      Alert.alert(err instanceof Error ? err.message : "Couldn't log that");
    }
  }

  async function save() {
    if (!draft) return;
    const items = draft.items.filter((i) => i.name.trim());
    if (items.length === 0) return Alert.alert("Add at least one item");
    setSaving(true);
    try {
      const captured: DraftPhoto[] = [];
      for (const p of photos) captured.push(await uploadPhoto(p.uri));
      const eatenAt = targetDate ? new Date(`${targetDate}T12:00:00`).toISOString() : new Date().toISOString();
      await fetchJson("/api/meals", {
        method: "POST",
        body: JSON.stringify({
          name: draft.name || "Meal",
          eaten_at: eatenAt,
          note: text || undefined,
          source: draft.source,
          items,
          photos: [...draft.photos, ...captured],
        }),
      });
      tapSuccess();
      router.replace("/");
    } catch (err) {
      Alert.alert(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  // Questions step
  if (draft?.questions?.length) {
    return (
      <>
        {analyzing ? <AnalyzingOverlay photoUri={photos[0]?.uri} /> : null}
        <QuestionsStep questions={draft.questions} onDone={handleAnswers} />
      </>
    );
  }

  // Review step
  if (draft) {
    const draftPhotoUrls = [...draft.photos.map((p) => p.url), ...photos.map((p) => p.uri)];
    const canReanalyze = photos.length > 0 || draft.source === "photo" || draft.source === "text";
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        {analyzing ? <AnalyzingOverlay photoUri={draftPhotoUrls[0]} /> : null}
        <ScrollView contentContainerClassName="p-5 gap-5">
          <View>
            <Kicker>AI readback</Kicker>
            <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">Review the plate</Text>
          </View>
          {draftPhotoUrls.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {draftPhotoUrls.map((url) => (
                <Image key={url} source={{ uri: url }} className="h-24 w-24 rounded-2xl" />
              ))}
            </ScrollView>
          ) : null}

          <NutritionFacts items={draft.items} />
          <MealReview
            name={draft.name}
            onNameChange={(name) => setDraft({ ...draft, name })}
            items={draft.items}
            onItemsChange={(items) => setDraft({ ...draft, items })}
          />

          {canReanalyze ? (
            <Card className="p-3">
              <Kicker className="mb-2">Correction note</Kicker>
              <Input
                placeholder="Not quite right? Add details and re-analyze…"
                value={refineText}
                onChangeText={setRefineText}
                multiline
                editable={!analyzing}
              />
              <Button size="sm" className="mt-2 self-end" onPress={reanalyze} disabled={analyzing || !refineText.trim()}>
                Re-analyze
              </Button>
            </Card>
          ) : null}

          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={() => setDraft(null)} disabled={saving}>
              Back
            </Button>
            <Button className="flex-1" onPress={save} disabled={saving}>
              {saving ? <Spinner /> : <Text className="text-base font-bold text-white">Save</Text>}
            </Button>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Capture step
  const canAnalyze = photos.length > 0 || text.trim().length > 0;
  const recentUnique = Array.from(new Map(recent.map((m) => [m.name.toLowerCase(), m])).values()).slice(0, 12);
  const favNames = new Set(favorites.map((m) => m.name.toLowerCase()));
  const quickAdd = [...favorites, ...recentUnique.filter((m) => !favNames.has(m.name.toLowerCase()))].slice(0, 8);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {analyzing ? <AnalyzingOverlay photoUri={photos[0]?.uri} /> : null}
      <ScrollView contentContainerClassName="p-5 gap-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Kicker>Camera first</Kicker>
            <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">Log a meal</Text>
          </View>
          <Button variant="ghost" size="icon" onPress={() => router.back()}>
            <Feather name="x" size={22} color="#000" />
          </Button>
        </View>

        {targetDate ? (
          <Card className="px-3 py-2">
            <Text className="text-sm text-foreground">
              Adding to{" "}
              <Text className="font-semibold">
                {new Date(`${targetDate}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
              </Text>
            </Text>
          </Card>
        ) : null}

        {quickAdd.length > 0 ? (
          <View className="border-y border-border py-3">
            <Kicker className="mb-2">Quick add · tap to log</Kicker>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {quickAdd.map((meal) => {
                const totals = mealTotals(meal);
                const fav = favNames.has(meal.name.toLowerCase());
                return (
                  <Pressable key={meal.id} onPress={() => quickLog(meal)} className="rounded-xl border border-border bg-card px-3 py-2 active:opacity-70">
                    <View className="flex-row items-center gap-1">
                      {fav ? <Feather name="star" size={13} color="#000" /> : null}
                      <Text className="text-sm font-semibold text-foreground">{meal.name}</Text>
                    </View>
                    <Text className="text-muted-foreground text-xs tabular-nums">{totals.calories} cal</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {photos.length > 0 ? (
          <View className="flex-row gap-3">
            {photos.map((photo, index) => (
              <View key={index} className="relative">
                <Image source={{ uri: photo.uri }} className="h-28 w-24 rounded-2xl" />
                <Pressable
                  className="absolute -right-1.5 -top-1.5 h-6 w-6 items-center justify-center rounded-full bg-foreground"
                  onPress={() => setPhotos(photos.filter((_, i) => i !== index))}
                >
                  <Feather name="x" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {photos.length < 3 ? (
          <View className="gap-2">
            <Pressable
              onPress={addFromCamera}
              className="h-44 items-center justify-center gap-3 rounded-3xl bg-block-mint active:opacity-90"
            >
              <View className="h-16 w-16 items-center justify-center rounded-full bg-primary">
                <Feather name="camera" size={24} color="#fff" />
              </View>
              <Text className="text-xl font-black tracking-tight text-foreground">
                {photos.length === 0 ? "Snap a photo" : "Add another angle"}
              </Text>
              <Kicker>Up to 3 angles</Kicker>
            </Pressable>
            <View className="flex-row gap-2">
              <Button variant="outline" className="flex-1" onPress={addFromLibrary}>
                <Feather name="image" size={16} color="#000" />
                <Text className="font-bold text-foreground">Library</Text>
              </Button>
              <Button variant="outline" className="flex-1" onPress={() => setScanOpen(true)}>
                <Ionicons name="barcode-outline" size={18} color="#000" />
                <Text className="font-bold text-foreground">Scan barcode</Text>
              </Button>
            </View>
          </View>
        ) : null}

        {showNote || text ? (
          <Card className="p-3">
            <Kicker className="mb-2">Context note</Kicker>
            <Input placeholder='Optional details, e.g. "2 rotis, dal, no butter"' value={text} onChangeText={setText} multiline />
          </Card>
        ) : (
          <Button variant="ghost" onPress={() => setShowNote(true)}>
            <Feather name="plus" size={16} color="#565656" />
            <Text className="font-bold text-muted-foreground">Add a note</Text>
          </Button>
        )}

        {canAnalyze ? (
          <Button onPress={() => runAnalysis(text)} disabled={analyzing}>
            {analyzing ? "Analyzing…" : "Analyze"}
          </Button>
        ) : null}

        <View className="mt-2 gap-3 border-t border-border pt-4">
          <Input placeholder="Search your past meals" value={search} onChangeText={setSearch} />
          {search.trim() ? (
            recentUnique.length > 0 ? (
              <View className="gap-2">
                {recentUnique.map((meal) => (
                  <MealListItem key={meal.id} meal={meal} onPress={() => logExisting(meal, "copy")} />
                ))}
              </View>
            ) : (
              <Text className="text-muted-foreground text-sm">No meals found.</Text>
            )
          ) : null}
        </View>
      </ScrollView>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onScanned={onScanned} busy={scanBusy} />
    </SafeAreaView>
  );
}
