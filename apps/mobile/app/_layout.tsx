import "../global.css";
import { useEffect } from "react";
import { AppState } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useReducedMotion } from "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "../lib/token-cache";
import { setTokenGetter } from "../lib/api";
import { clearCache, hydrateCache } from "../lib/cache";
import { useColors } from "../lib/colors";
import { hydrateDraft } from "../lib/draft";
import { hydrateQueue, flushQueue } from "../lib/queue";
import { hydrateGoalHistory } from "../lib/goal-history";

// Hold the native splash until auth state is known, then cross-fade it into
// the first screen instead of the default hard cut.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// Restore the last session's meals/goals cache now, at module load — a ~ms
// disk read that finishes well before Clerk hydrates and any screen mounts,
// so Today's first paint is data, not a skeleton. Losing that race is safe:
// hydration never overwrites in-memory data, worst case is the old skeleton.
void hydrateCache();

// Crash reporting — active only when a DSN is configured (dev builds; the
// native module is absent in Expo Go, where init is skipped anyway).
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN && !__DEV__) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("@sentry/react-native").init({ dsn: SENTRY_DSN });
}

// Registers Clerk's getToken with the plain fetch client, and bounces the user
// between the auth screens and the tabs based on sign-in state.
function AuthGate() {
  const colors = useColors();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  // Register during render, not in an effect: child screens' effects run before
  // a parent's, so an effect here loses the race and the tabs' first fetches go
  // out unauthenticated (goals then 401s silently → skeleton stuck forever).
  setTokenGetter(getToken);

  useEffect(() => {
    if (!isLoaded) return;
    const inAuthGroup = segments[0] === "(auth)";
    // Signed-out default is the pitch (welcome), not "Welcome back" — most
    // first opens are new users; returning ones tap the sign-in link.
    if (isSignedIn && inAuthGroup) router.replace("/");
    else if (!isSignedIn && !inAuthGroup) router.replace("/(auth)/welcome");
    // 200ms matches screen pushes (DESIGN.md §2.8); the fade also masks the
    // redirect frame above.
    SplashScreen.setOptions({ fade: true, duration: reducedMotion ? 0 : 200 });
    void SplashScreen.hideAsync();
  }, [isLoaded, isSignedIn, segments, router, reducedMotion]);

  // Crash/offline safety nets: restore a mid-review draft from the last
  // session, resurrect queued offline saves, and retry them whenever the app
  // comes back to the foreground (plus a slow tick for wifi returning while
  // the app stays open — flushQueue is a no-op when the queue is empty).
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      // Sign-out (or account delete): wipe the cached + persisted meals/goals
      // so the next account on this device can't inherit them.
      clearCache();
      return;
    }
    void hydrateDraft();
    void hydrateQueue();
    void hydrateGoalHistory();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void flushQueue();
    });
    const tick = setInterval(() => void flushQueue(), 30_000);
    return () => {
      sub.remove();
      clearInterval(tick);
    };
  }, [isLoaded, isSignedIn]);

  return (
    // simple_push keeps the native slide but honors animationDuration (iOS);
    // default push is a fixed ~350ms and can't be sped up. contentStyle keeps
    // the scene behind transitions on-theme (default is white → flashes in dark).
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "simple_push",
        animationDuration: 200,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="add" options={{ presentation: "modal" }} />
      <Stack.Screen name="ask-bevi" options={{ presentation: "modal" }} />
      <Stack.Screen name="menu-scout" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ClerkProvider
      tokenCache={tokenCache}
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <ClerkLoaded>
            <AuthGate />
          </ClerkLoaded>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ClerkProvider>
  );
}
