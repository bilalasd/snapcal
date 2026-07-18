import { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useSignIn } from "@clerk/clerk-expo";
import { Bevi } from "../../components/bevi";
import { SsoRow } from "../../components/sso";
import { Button, Field, Input, PasswordInput } from "../../components/ui";

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
        <Bevi pose="wave" size={110} />
        <Text className="mt-4 text-muted-foreground text-xs font-bold uppercase tracking-[3px]">
          Loggi
        </Text>
        <Text className="mt-1 text-5xl font-black tracking-tighter text-foreground">
          Welcome back
        </Text>

        <View className="mt-8 gap-3">
          <Field label="Email">
            <Input
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
          </Field>
          <Field label="Password">
            <PasswordInput
              placeholder="Your password"
              textContentType="password"
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
            />
          </Field>
          {error && <Text accessibilityLiveRegion="polite" accessibilityRole="alert" className="text-destructive text-sm">{error}</Text>}
          <Button className="mt-2" disabled={busy} onPress={onSubmit}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <Link href="/(auth)/reset-password" className="self-center py-1 text-sm font-semibold text-muted-foreground">
            Forgot password?
          </Link>
        </View>

        <View className="mt-6">
          <SsoRow />
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
