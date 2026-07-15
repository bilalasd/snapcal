import { useState } from "react";
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useSignIn } from "@clerk/clerk-expo";

const inputClass = "rounded-2xl border border-border bg-muted px-4 py-4 text-base text-foreground";

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
            <TextInput className={inputClass} placeholder="Reset code" placeholderTextColor="#565656" keyboardType="number-pad" value={code} onChangeText={setCode} />
            <TextInput className={inputClass} placeholder="New password" placeholderTextColor="#565656" secureTextEntry textContentType="newPassword" value={password} onChangeText={setPassword} />
            {error && <Text className="text-destructive text-sm">{error}</Text>}
            <Pressable className="mt-2 rounded-2xl bg-primary py-4 active:opacity-80" disabled={busy} onPress={reset}>
              <Text className="text-center text-base font-bold text-white">{busy ? "Resetting…" : "Set new password"}</Text>
            </Pressable>
          </View>
        ) : (
          <View className="mt-8 gap-3">
            <TextInput className={inputClass} placeholder="Email" placeholderTextColor="#565656" autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail} />
            {error && <Text className="text-destructive text-sm">{error}</Text>}
            <Pressable className="mt-2 rounded-2xl bg-primary py-4 active:opacity-80" disabled={busy} onPress={sendCode}>
              <Text className="text-center text-base font-bold text-white">{busy ? "Sending…" : "Send reset code"}</Text>
            </Pressable>
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
