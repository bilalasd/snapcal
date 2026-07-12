import { useState } from "react";
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useSignIn } from "@clerk/clerk-expo";

export default function SignIn() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn.create({ identifier: email, password });
      await setActive({ session: res.createdSessionId });
    } catch (e: any) {
      setError(e?.errors?.[0]?.message ?? "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1 justify-center px-6"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Text className="text-muted-foreground text-xs font-bold uppercase tracking-[3px]">
          Mealio
        </Text>
        <Text className="mt-1 text-5xl font-black tracking-tighter text-foreground">
          Welcome back
        </Text>

        <View className="mt-8 gap-3">
          <TextInput
            className="rounded-2xl border border-border bg-muted px-4 py-4 text-base text-foreground"
            placeholder="Email"
            placeholderTextColor="#565656"
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            className="rounded-2xl border border-border bg-muted px-4 py-4 text-base text-foreground"
            placeholder="Password"
            placeholderTextColor="#565656"
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={setPassword}
          />
          {error && <Text className="text-destructive text-sm">{error}</Text>}
          <Pressable
            className="mt-2 rounded-2xl bg-primary py-4 active:opacity-80"
            disabled={busy}
            onPress={onSubmit}
          >
            <Text className="text-center text-base font-bold text-white">
              {busy ? "Signing in…" : "Sign in"}
            </Text>
          </Pressable>
        </View>

        <View className="mt-6 flex-row justify-center gap-1">
          <Text className="text-muted-foreground">No account?</Text>
          <Link href="/(auth)/sign-up" className="font-bold text-foreground">
            Sign up
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
