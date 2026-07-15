import { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useSignIn } from "@clerk/clerk-expo";
import { Button, Field, Input, PasswordInput } from "../../components/ui";

export default function ResetPassword() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn.create({ strategy: "reset_password_email_code", identifier: email });
      setSent(true);
    } catch (e: any) {
      setError(e?.errors?.[0]?.message ?? "Couldn't send a code");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn.attemptFirstFactor({ strategy: "reset_password_email_code", code, password });
      await setActive({ session: res.createdSessionId });
    } catch (e: any) {
      setError(e?.errors?.[0]?.message ?? "Couldn't reset password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView className="flex-1 justify-center px-6" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Text className="text-muted-foreground text-xs font-bold uppercase tracking-[3px]">Loggi</Text>
        <Text className="mt-1 text-5xl font-black tracking-tighter text-foreground">
          {sent ? "Check your email" : "Reset password"}
        </Text>

        {sent ? (
          <View className="mt-8 gap-3">
            <Field label="Reset code">
              <Input
                placeholder="6-digit code"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                value={code}
                onChangeText={setCode}
              />
            </Field>
            <Field label="New password">
              <PasswordInput
                placeholder="Pick a new password"
                textContentType="newPassword"
                autoComplete="new-password"
                value={password}
                onChangeText={setPassword}
              />
            </Field>
            {error && <Text className="text-destructive text-sm">{error}</Text>}
            <Button className="mt-2" disabled={busy} onPress={reset}>
              {busy ? "Resetting…" : "Set new password"}
            </Button>
          </View>
        ) : (
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
            {error && <Text className="text-destructive text-sm">{error}</Text>}
            <Button className="mt-2" disabled={busy} onPress={sendCode}>
              {busy ? "Sending…" : "Send reset code"}
            </Button>
          </View>
        )}

        <View className="mt-6 flex-row justify-center gap-1">
          <Text className="text-muted-foreground">Remembered it?</Text>
          <Link href="/(auth)/sign-in" className="font-bold text-foreground">Sign in</Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
