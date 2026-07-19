import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Alert as SystemAlert } from "react-native";
import Animated, { Easing, FadeIn, FadeInUp, useReducedMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Alert, Button, ChoiceCard, Kicker } from "../components/ui";
import { Bevi } from "../components/bevi";
import { tapSuccess } from "../lib/haptics";
import { MONTHLY_SKU, YEARLY_SKU, loadPlans, restore, subscribe, type Plan } from "../lib/purchases";

// The deal, priced. The welcome carousel promises "no tricks"; this is where
// the promise meets a number. Narrow monthly/annual gap on purpose
// (PRODUCT.md §6) — no anchor spread, no fake urgency, no guilt. The native
// App Store sheet does the actual charging.
const FALLBACK_PRICE: Record<string, string> = { [MONTHLY_SKU]: "$4.99", [YEARLY_SKU]: "$49.99" };

export default function Paywall() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [storeDown, setStoreDown] = useState(false);
  const [selected, setSelected] = useState(MONTHLY_SKU);
  const [busy, setBusy] = useState<null | "buy" | "restore">(null);
  const [restoreMiss, setRestoreMiss] = useState(false);

  const load = useCallback(() => {
    setStoreDown(false);
    void loadPlans().then((result) => (result ? setPlans(result) : setStoreDown(true)));
  }, []);
  useEffect(load, [load]);

  const price = (sku: string) => plans?.find((p) => p.sku === sku)?.displayPrice ?? FALLBACK_PRICE[sku];
  const trialEnds = new Date(Date.now() + 15 * 86_400_000).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });

  async function start() {
    setBusy("buy");
    try {
      if (await subscribe(selected)) {
        tapSuccess();
        router.replace("/");
        return;
      }
    } catch (err: any) {
      // A dismissed payment sheet is a decision, not an error — stay quiet.
      const code = String(err?.code ?? err?.message ?? "");
      if (!/cancel/i.test(code)) {
        SystemAlert.alert("Couldn't start the trial", "Nothing was charged — give it another go in a moment.");
      }
    }
    setBusy(null);
  }

  async function onRestore() {
    setBusy("restore");
    setRestoreMiss(false);
    if (await restore()) {
      tapSuccess();
      router.replace("/");
      return;
    }
    setRestoreMiss(true);
    setBusy(null);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Animated.View entering={reduce ? undefined : FadeIn.duration(130)} style={{ flex: 1 }}>
        <View className="flex-1 px-5 pb-6 pt-2">
          <ScrollView contentContainerClassName="gap-5" showsVerticalScrollIndicator={false}>
            <View>
              <Kicker>The deal</Kicker>
              <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">
                Your first 15 days are on me.
              </Text>
              <Text className="mt-4 text-sm font-semibold text-muted-foreground">
                The whole product, nothing held back. If Loggi isn't earning its keep, cancel before {trialEnds} and
                you pay nothing.
              </Text>
            </View>

            <View className="items-center">
              <Bevi pose="promise" size={120} delay={40} />
            </View>

            {storeDown ? (
              <View className="gap-3">
                <Alert icon="cloud-off" title="Can't reach the App Store">
                  Prices and the free trial live there. Try again in a moment — you can also sort this out later.
                </Alert>
                <Button variant="outline" onPress={load}>
                  Try again
                </Button>
              </View>
            ) : (
              <View className="gap-2">
                <Animated.View entering={reduce ? undefined : FadeInUp.duration(130).delay(80).easing(Easing.out(Easing.quad))}>
                  <ChoiceCard
                    selected={selected === MONTHLY_SKU}
                    onPress={() => setSelected(MONTHLY_SKU)}
                    title={`Monthly · ${price(MONTHLY_SKU)}`}
                    blurb="Month by month. Cancel anytime."
                  />
                </Animated.View>
                <Animated.View entering={reduce ? undefined : FadeInUp.duration(130).delay(120).easing(Easing.out(Easing.quad))}>
                  <ChoiceCard
                    selected={selected === YEARLY_SKU}
                    onPress={() => setSelected(YEARLY_SKU)}
                    title={`Yearly · ${price(YEARLY_SKU)}`}
                    blurb="Two months free. A convenience, not a trap."
                  />
                </Animated.View>
              </View>
            )}

            <Animated.View entering={reduce ? undefined : FadeIn.duration(130).delay(160).easing(Easing.out(Easing.quad))}>
              <Text className="text-xs font-medium text-muted-foreground">
                Auto-renews after the trial ends; manage or cancel anytime in your App Store settings. Your data stays
                yours either way — export it or delete it whenever.
              </Text>
            </Animated.View>
          </ScrollView>

          <View className="gap-2 pt-6">
            {restoreMiss ? (
              <Text
                accessibilityLiveRegion="polite"
                className="text-center text-xs font-medium text-muted-foreground"
              >
                No subscription found on this Apple ID.
              </Text>
            ) : null}
            {storeDown ? (
              <Button variant="ghost" onPress={() => router.replace("/")}>
                <Text className="font-bold text-muted-foreground">Continue for now</Text>
              </Button>
            ) : (
              <>
                <Button onPress={() => void start()} loading={busy === "buy"} disabled={busy !== null}>
                  Start my free 15 days
                </Button>
                <Button variant="ghost" onPress={() => void onRestore()} disabled={busy !== null}>
                  <Text className="font-bold text-muted-foreground">
                    {busy === "restore" ? "Checking…" : "Already subscribed? Restore"}
                  </Text>
                </Button>
              </>
            )}
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}
