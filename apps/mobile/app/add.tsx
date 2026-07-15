import { useEffect, useState } from "react";
import { View, Text, ScrollView, Alert, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  itemsToDraft,
  resolveAnswers,
  type ApiMeal,
  type ClarifyAnswer,
  type ClarifyQuestion,
  type DraftItem,
  type DraftPhoto,
  type MealDraft,
} from "@loggi/shared";
import { fetchJson, uploadPhoto } from "../lib/api";
import { tapSuccess } from "../lib/haptics";
import { popDraft } from "../lib/draft";
import {
  addOptimisticMeal,
  discardOptimistic,
  getCachedFavorites,
  getCachedRecents,
  optimisticMeal,
  setCachedFavorites,
  setCachedRecents,
  settleMeal,
} from "../lib/cache";
import { pickPhotos, resizeToPhoto, type PickedPhoto } from "../lib/image";
import { lookupBarcode } from "../lib/barcode";
import { Bevi } from "../components/bevi";
import { CameraCapture } from "../components/camera-capture";
import { Button, Card, Input, Kicker } from "../components/ui";
import { Photo } from "../components/photo";
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

// No chooser screen anymore — the tab bar's speed dial picks the entry:
// camera (default), search (food database), or saved foods.
export default function Add() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string; intent?: string }>();
  const targetDate = params.date ?? null;
  const initialMode = params.intent === "search" ? "search" : params.intent === "saved" ? "saved" : "camera";
  // Stateful so a failed camera analysis can hand off to describe-by-text.
  const [mode, setMode] = useState(initialMode);

  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [text, setText] = useState("");
  // Cached from the last visit so the saved/search lists paint instantly.
  const [favorites, setFavorites] = useState<ApiMeal[]>(() => getCachedFavorites() ?? []);
  const [recent, setRecent] = useState<ApiMeal[]>(() => getCachedRecents() ?? []);
  const [search, setSearch] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [refineText, setRefineText] = useState("");
  // A draft stashed by another screen (e.g. "log again" from the meal drawer)
  // lands directly on the review step.
  const [draft, setDraft] = useState<Draft | null>(() => {
    const stashed = popDraft();
    return stashed
      ? {
          name: stashed.name,
          items: stashed.items,
          source: stashed.source,
          photos: stashed.photos ?? [],
          questions: stashed.questions?.length ? stashed.questions : undefined,
        }
      : null;
  });
  const [cameraOpen, setCameraOpen] = useState(mode === "camera" && !draft);
  const [lookupBusy, setLookupBusy] = useState(false);
  // Barcode misses surface as an inline card over the viewfinder (not an
  // Alert), so the scanner stays live for an immediate retry or snap.
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  async function runAnalysis(
    fullText: string,
    opts?: { suppressQuestions?: boolean; pics?: PickedPhoto[] },
  ) {
    const pics = opts?.pics ?? photos;
    setAnalyzing(true);
    try {
      const result = await fetchJson<{ meal_name: string; items: DraftItem[]; questions?: ClarifyQuestion[] }>("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ images: pics.map((p) => p.encoded), text: fullText }),
      });
      setDraft({
        name: result.meal_name,
        items: result.items,
        source: pics.length > 0 ? "photo" : "text",
        photos: [],
        questions: opts?.suppressQuestions ? undefined : result.questions?.length ? result.questions : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Try a clearer photo or a quick description.";
      if (mode === "camera" && !draft) {
        // Principle 6: the log never dead-ends — a failed photo hands off to words.
        Alert.alert("That one stumped Bevi", msg, [
          {
            text: "Describe it instead",
            onPress: () => {
              setPhotos([]);
              setMode("search");
            },
          },
          { text: "Retry photo", onPress: () => setCameraOpen(true) },
        ]);
      } else {
        Alert.alert("That one stumped Bevi", msg);
      }
    } finally {
      setAnalyzing(false);
    }
  }

  // Shutter → capture a food/label photo → analyze immediately.
  async function onPhoto(uri: string) {
    try {
      const p = await resizeToPhoto(uri);
      setPhotos([p]);
      setScanNotice(null);
      setCameraOpen(false);
      runAnalysis(text, { pics: [p] });
    } catch (e) {
      Alert.alert("Couldn't use that photo", e instanceof Error ? e.message : "Try again.");
    }
  }

  // Library pick from inside the camera → analyze immediately.
  async function onLibrary() {
    try {
      const picked = await pickPhotos(1);
      if (!picked.length) return;
      setPhotos(picked);
      setScanNotice(null);
      setCameraOpen(false);
      runAnalysis(text, { pics: picked });
    } catch (e) {
      Alert.alert("Couldn't open library", e instanceof Error ? e.message : "Try again.");
    }
  }

  // Barcode detected in-frame → Open Food Facts lookup.
  async function onBarcode(code: string) {
    setScanNotice(null);
    setLookupBusy(true);
    try {
      const item = await lookupBarcode(code);
      if (!item) {
        setScanNotice("That barcode isn't in the food database — snap the food or its label instead.");
        setLookupBusy(false);
        return; // keep the camera open so they can snap
      }
      setCameraOpen(false);
      setLookupBusy(false);
      setDraft({ name: item.name, items: [item], source: "text", photos: [] });
    } catch {
      setLookupBusy(false);
      setScanNotice("The lookup didn't go through — scan again, or snap the food.");
    }
  }

  useEffect(() => {
    fetchJson<ApiMeal[]>("/api/meals?favorites=true")
      .then((m) => {
        setFavorites(m);
        setCachedFavorites(m);
      })
      .catch(() => {});
  }, []);

  // Also covers the initial recents load (fires immediately with an empty q).
  useEffect(() => {
    const q = search.trim();
    const handle = setTimeout(() => {
      fetchJson<ApiMeal[]>(`/api/meals?recent=true${q ? `&q=${encodeURIComponent(q)}` : ""}`)
        .then((m) => {
          setRecent(m);
          if (!q) setCachedRecents(m);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  // Text-only logging — the fallback principle 6 promises. Reuses the same
  // analyze endpoint; with no photos the draft lands as source "text".
  function describe() {
    const q = search.trim();
    if (!q) return;
    setText(q);
    runAnalysis(q);
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

  // One-tap re-log — optimistic, same as save().
  function quickLog(meal: ApiMeal) {
    const items = itemsToDraft(meal).filter((i) => i.name.trim());
    if (items.length === 0) return;
    const eatenAt = targetDate ? new Date(`${targetDate}T12:00:00`).toISOString() : new Date().toISOString();
    const photosPayload = meal.photos.map((p) => ({ url: p.url, pathname: p.pathname }));

    const optimistic = optimisticMeal({ name: meal.name, items, source: "copy", photos: photosPayload }, eatenAt, []);
    addOptimisticMeal(optimistic);
    tapSuccess();
    router.replace("/");

    fetchJson("/api/meals", {
      method: "POST",
      body: JSON.stringify({ name: meal.name || "Meal", eaten_at: eatenAt, source: "copy", items, photos: photosPayload }),
    })
      .then(() => settleMeal(optimistic.id))
      .catch((err) => {
        discardOptimistic(optimistic.id);
        Alert.alert("Couldn't log that", err instanceof Error ? err.message : "Try again.");
      });
  }

  // Optimistic save: show the meal on Today immediately, upload + POST in the
  // background. The felt latency of logging drops to ~0.
  function save() {
    if (!draft) return;
    const items = draft.items.filter((i) => i.name.trim());
    if (items.length === 0) return Alert.alert("Add at least one item");
    const eatenAt = targetDate ? new Date(`${targetDate}T12:00:00`).toISOString() : new Date().toISOString();

    // 1. Stash into the cache + navigate right away.
    const optimistic = optimisticMeal({ ...draft, items }, eatenAt, photos.map((p) => p.uri));
    addOptimisticMeal(optimistic);
    tapSuccess();
    router.replace("/");

    // 2. Do the real work in the background; the next Today refresh reconciles.
    (async () => {
      try {
        const captured = await Promise.all(photos.map((p) => uploadPhoto(p.uri)));
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
        settleMeal(optimistic.id);
      } catch (err) {
        discardOptimistic(optimistic.id);
        Alert.alert("Meal didn't save", err instanceof Error ? err.message : "Check your connection and try again.");
      }
    })();
  }

  function backFromReview() {
    setDraft(null);
    setPhotos([]);
    if (mode === "camera") setCameraOpen(true); // retake instead of dead-ending on black
  }

  // Camera mode lives in a fullscreen modal (a pageSheet would leave the tab
  // screen peeking through above the viewfinder); rendered in every branch so
  // the presentation doesn't flip when the flow moves to questions/review.
  const screenOptions = <Stack.Screen options={{ presentation: initialMode === "camera" ? "fullScreenModal" : "modal" }} />;

  // Questions step
  if (draft?.questions?.length) {
    return (
      <>
        {screenOptions}
        {analyzing ? <AnalyzingOverlay photoUri={photos[0]?.uri} /> : null}
        <QuestionsStep questions={draft.questions} onDone={handleAnswers} />
      </>
    );
  }

  // Review step
  if (draft) {
    const draftPhotoUrls = [...draft.photos.map((p) => p.url), ...photos.map((p) => p.uri)];
    const canReanalyze = photos.length > 0 || draft.source === "photo" || draft.source === "text";
    const reviewTotal = draft.items.reduce((s, i) => s + (i.calories || 0), 0);
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        {screenOptions}
        {analyzing ? <AnalyzingOverlay photoUri={draftPhotoUrls[0]} /> : null}
        <ScrollView contentContainerClassName="p-5 gap-5 pb-32" keyboardShouldPersistTaps="handled">
          {/* Header + hero total */}
          <View className="flex-row items-end justify-between gap-4">
            <View className="flex-1">
              <Kicker>AI readback</Kicker>
              <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">Review the plate</Text>
            </View>
            <View className="items-end">
              <Text className="text-5xl font-black tracking-tighter tabular-nums text-foreground">
                {reviewTotal.toLocaleString()}
              </Text>
              <Kicker>cal total</Kicker>
            </View>
          </View>

          {draftPhotoUrls.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {draftPhotoUrls.map((url) => (
                <Photo key={url} source={{ uri: url }} className="h-24 w-24 rounded-2xl" />
              ))}
            </ScrollView>
          ) : null}

          {draft.items.some((i) => i.confidence === "low") ? (
            <Card className="flex-row items-center gap-3 border-transparent bg-block-cream p-3">
              <Bevi pose="clipboard" size={48} />
              <Text className="flex-1 text-sm font-semibold text-foreground">
                I'm guessing on the portions marked in orange — worth a quick check before you save.
              </Text>
            </Card>
          ) : null}

          {/* Edit the items first, then see the resulting nutrition */}
          <MealReview
            name={draft.name}
            onNameChange={(name) => setDraft({ ...draft, name })}
            items={draft.items}
            onItemsChange={(items) => setDraft({ ...draft, items })}
          />
          <NutritionFacts items={draft.items} />

          {canReanalyze ? (
            <Card className="p-4">
              <Kicker className="mb-2">Not quite right?</Kicker>
              <Input
                placeholder="Add a detail and re-analyze…"
                value={refineText}
                onChangeText={setRefineText}
                multiline
                editable={!analyzing}
              />
              <Button variant="outline" size="sm" className="mt-2 self-end" onPress={reanalyze} disabled={analyzing || !refineText.trim()}>
                <Feather name="refresh-cw" size={14} color="#000" />
                <Text className="font-bold text-foreground">Re-analyze</Text>
              </Button>
            </Card>
          ) : null}
        </ScrollView>

        {/* Sticky action bar — Save always reachable */}
        <View
          className="absolute inset-x-0 bottom-0 flex-row gap-3 border-t border-border bg-background px-5 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) + 12 }}
        >
          <Button variant="outline" className="flex-1" onPress={backFromReview}>
            Back
          </Button>
          <Button className="flex-[2]" onPress={save}>
            <Text className="text-base font-bold text-white">Save meal</Text>
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  // Camera entry — straight into the viewfinder, no menu in between.
  if (mode === "camera") {
    return (
      <View className="flex-1 bg-black">
        {screenOptions}
        {analyzing ? <AnalyzingOverlay photoUri={photos[0]?.uri} /> : null}
        <CameraCapture
          open={cameraOpen && !analyzing}
          onClose={() => router.back()}
          onPhoto={onPhoto}
          onBarcode={onBarcode}
          onLibrary={onLibrary}
          busy={lookupBusy}
        />
        {scanNotice && cameraOpen && !analyzing ? (
          <View
            className="absolute inset-x-5 flex-row items-center gap-3 rounded-2xl bg-background p-4"
            style={{ bottom: Math.max(insets.bottom, 16) + 148 }}
          >
            <Bevi pose="clipboard" size={48} />
            <View className="flex-1">
              <Text className="text-base font-black text-foreground">That one stumped Bevi</Text>
              <Text className="mt-0.5 text-sm text-foreground">{scanNotice}</Text>
            </View>
            <Pressable
              onPress={() => setScanNotice(null)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              className="h-8 w-8 items-center justify-center active:opacity-60"
              hitSlop={8}
            >
              <Feather name="x" size={18} color="#565656" />
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  // Search / saved entries
  const recentUnique = Array.from(new Map(recent.map((m) => [m.name.toLowerCase(), m])).values()).slice(0, 12);
  const favNames = new Set(favorites.map((m) => m.name.toLowerCase()));
  const savedMeals = [...favorites, ...recentUnique.filter((m) => !favNames.has(m.name.toLowerCase()))].slice(0, 12);
  const list = mode === "search" ? recentUnique : savedMeals;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {screenOptions}
      {analyzing ? <AnalyzingOverlay /> : null}
      <ScrollView contentContainerClassName="p-5 gap-4" keyboardShouldPersistTaps="handled">
        {mode === "search" ? (
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <Input placeholder="Search meals, or describe a new one" value={search} onChangeText={setSearch} autoFocus />
            </View>
            <Button variant="ghost" size="icon" accessibilityLabel="Close" onPress={() => router.back()}>
              <Feather name="x" size={22} color="#000" />
            </Button>
          </View>
        ) : (
          <View className="flex-row items-center justify-between">
            <View>
              <Kicker>Tap to log again</Kicker>
              <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">Saved foods</Text>
            </View>
            <Button variant="ghost" size="icon" accessibilityLabel="Close" onPress={() => router.back()}>
              <Feather name="x" size={22} color="#000" />
            </Button>
          </View>
        )}

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

        {mode === "search" && search.trim() ? (
          <Button variant="outline" onPress={describe} disabled={analyzing}>
            <Feather name="edit-3" size={14} color="#000" />
            <Text className="font-bold text-foreground">Estimate "{search.trim()}" with Bevi</Text>
          </Button>
        ) : null}

        {list.length > 0 ? (
          <View className="gap-2">
            {list.map((meal) => (
              <MealListItem
                key={meal.id}
                meal={meal}
                onPress={() => (mode === "saved" ? quickLog(meal) : logExisting(meal, "copy"))}
              />
            ))}
          </View>
        ) : (
          <Text className="text-muted-foreground text-sm">
            {mode === "search" ? "No meals found." : "Nothing saved yet — log a meal first."}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
