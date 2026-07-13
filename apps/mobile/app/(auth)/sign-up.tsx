import { useState } from "react";
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useSignUp } from "@clerk/clerk-expo";
import { SsoRow } from "../../components/sso";

export default function SignUp() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingCode, setPendingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingCode(true);
    } catch (e: any) {
      setError(e?.errors?.[0]?.message ?? "Could not sign up");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signUp.attemptEmailAddressVerification({ code });
      await setActive({ session: res.createdSessionId });
    } catch (e: any) {
      setError(e?.errors?.[0]?.message ?? "Invalid code");
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
          {pendingCode ? "Check your email" : "Create account"}
        </Text>

        {pendingCode ? (
          <View className="mt-8 gap-3">
            <TextInput
              className="rounded-2xl border border-border bg-muted px-4 py-4 text-base text-foreground"
              placeholder="Verification code"
              placeholderTextColor="#565656"
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
            />
            {error && <Text className="text-destructive text-sm">{error}</Text>}
            <Pressable
              className="mt-2 rounded-2xl bg-primary py-4 active:opacity-80"
              disabled={busy}
              onPress={onVerify}
            >
              <Text className="text-center text-base font-bold text-white">
                {busy ? "Verifying…" : "Verify"}
              </Text>
            </Pressable>
          </View>
        ) : (
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
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
            />
            {error && <Text className="text-destructive text-sm">{error}</Text>}
            <Pressable
              className="mt-2 rounded-2xl bg-primary py-4 active:opacity-80"
              disabled={busy}
              onPress={onCreate}
            >
              <Text className="text-center text-base font-bold text-white">
                {busy ? "Creating…" : "Create account"}
              </Text>
            </Pressable>
          </View>
        )}

        {!pendingCode ? (
          <View className="mt-6">
            <SsoRow />
          </View>
        ) : null}

        <View className="mt-6 flex-row justify-center gap-1">
          <Text className="text-muted-foreground">Have an account?</Text>
          <Link href="/(auth)/sign-in" className="font-bold text-foreground">
            Sign in
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
