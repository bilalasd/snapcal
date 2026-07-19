import { useEffect, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { useSSO } from "@clerk/clerk-expo";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useColors } from "../lib/colors";

// Finishes any auth session the browser bounced back (call once, module scope).
WebBrowser.maybeCompleteAuthSession();

function useWarmBrowser() {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

/** Google + Apple sign-in row. Clerk hosts the OAuth; we open it in a browser
 *  session and set the resulting session active. `dividerBelow` flips the "or"
 *  rule to sit under the buttons — for screens where SSO leads and email follows. */
export function SsoRow({ dividerBelow = false }: { dividerBelow?: boolean }) {
  const colors = useColors();
  useWarmBrowser();
  const { startSSOFlow } = useSSO();
  const [busy, setBusy] = useState<null | "google" | "apple">(null);

  async function run(kind: "google" | "apple") {
    if (busy) return;
    setBusy(kind);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: kind === "google" ? "oauth_google" : "oauth_apple",
        redirectUrl: Linking.createURL("/", { scheme: "loggi" }),
      });
      if (createdSessionId && setActive) await setActive({ session: createdSessionId });
      // If no session, Clerk needs more steps (e.g. new-account MFA) — rare for
      // these providers; leaving the user on the sign-in screen is acceptable.
    } catch (e: any) {
      Alert.alert(e?.errors?.[0]?.message ?? "Sign-in failed");
    } finally {
      setBusy(null);
    }
  }

  const divider = (
    <View className="flex-row items-center gap-3">
      <View className="h-px flex-1 bg-border" />
      <Text className="text-muted-foreground text-xs font-bold uppercase tracking-[2px]">or</Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );

  return (
    <View className="gap-3">
      {!dividerBelow && divider}
      {/* Apple leads: HIG requires Sign in with Apple ahead of other providers. */}
      <View className="flex-row gap-3">
        <Pressable
          onPress={() => run("apple")}
          disabled={!!busy}
          className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4 active:opacity-80 ${busy ? "opacity-40" : ""}`}
        >
          <FontAwesome name="apple" size={20} color={colors.background} />
          <Text className="text-base font-bold text-primary-foreground">Apple</Text>
        </Pressable>
        <Pressable
          onPress={() => run("google")}
          disabled={!!busy}
          className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-border py-4 active:opacity-70 ${busy ? "opacity-40" : ""}`}
        >
          <FontAwesome name="google" size={18} color={colors.foreground} />
          <Text className="text-base font-bold text-foreground">Google</Text>
        </Pressable>
      </View>
      {dividerBelow && divider}
    </View>
  );
}
