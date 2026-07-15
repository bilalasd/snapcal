import "../global.css";
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "../lib/token-cache";
import { setTokenGetter } from "../lib/api";
import { useColors } from "../lib/colors";

// Registers Clerk's getToken with the plain fetch client, and bounces the user
// between the auth screens and the tabs based on sign-in state.
function AuthGate() {
  const colors = useColors();
  console.log("VERIFY scheme:", require("react-native").Appearance.getColorScheme(), "bg:", colors.background);
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Register during render, not in an effect: child screens' effects run before
  // a parent's, so an effect here loses the race and the tabs' first fetches go
  // out unauthenticated (goals then 401s silently → skeleton stuck forever).
  setTokenGetter(getToken);

  useEffect(() => {
    if (!isLoaded) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (isSignedIn && inAuthGroup) router.replace("/");
    else if (!isSignedIn && !inAuthGroup) router.replace("/(auth)/sign-in");
  }, [isLoaded, isSignedIn, segments, router]);

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
