import { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useSignUp } from "@clerk/clerk-expo";
import { Bevi } from "../../components/bevi";
import { SsoRow } from "../../components/sso";
import { Button, Field, Input, PasswordInput } from "../../components/ui";

export default function SignUp() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingCode, setPendingCode] = useState(false);
  const [resent, setResent] = useState(false);
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
      setResent(false);
    } catch (e: any) {
      setError(e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? "Could not sign up");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(value = code) {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signUp.attemptEmailAddressVerification({ code: value.trim() });
      await setActive({ session: res.createdSessionId });
    } catch (e: any) {
      setError(e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setResent(true);
    } catch (e: any) {
      setError(e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? "Couldn't resend — try again in a minute");
    } finally {
      setBusy(false);
    }
  }

  // Editing the address restarts cleanly: same form, state kept, new create call.
  function onWrongEmail() {
    setPendingCode(false);
    setCode("");
    setError(null);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1 justify-center px-6"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Bevi pose="wave" size={90} />
        <Text className="mt-4 text-muted-foreground text-xs font-bold uppercase tracking-[3px]">
          Loggi
        </Text>
        <Text className="mt-1 text-5xl font-black tracking-tighter text-foreground">
          {pendingCode ? "Check your email" : "Create account"}
        </Text>

        {pendingCode ? (
          <View className="mt-8 gap-3">
            <Text className="text-sm font-medium text-muted-foreground">
              I sent a 6-digit code to <Text className="font-bold text-foreground">{email}</Text>.
            </Text>
            <Field label="Verification code">
              <Input
                placeholder="6-digit code"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                value={code}
                onChangeText={(v) => {
                  setCode(v);
                  // Six digits (typed or autofilled) submit themselves.
                  if (/^\d{6}$/.test(v.trim())) void onVerify(v);
                }}
              />
            </Field>
            {error && <Text accessibilityLiveRegion="polite" accessibilityRole="alert" className="text-destructive text-sm">{error}</Text>}
            <Button className="mt-2" disabled={busy || code.trim().length !== 6} onPress={() => onVerify()}>
              {busy ? "Verifying…" : "Verify"}
            </Button>
            <View className="mt-1 flex-row justify-center gap-6">
              <Pressable onPress={onResend} disabled={busy} accessibilityRole="button" hitSlop={8} className="active:opacity-60">
                <Text className="text-sm font-semibold text-muted-foreground">
                  {resent ? "Code sent again" : "Resend code"}
                </Text>
              </Pressable>
              <Pressable onPress={onWrongEmail} disabled={busy} accessibilityRole="button" hitSlop={8} className="active:opacity-60">
                <Text className="text-sm font-semibold text-muted-foreground">Wrong email?</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <View className="mt-8">
              <SsoRow dividerBelow />
            </View>
            <View className="mt-3 gap-3">
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
                  placeholder="Pick a password"
                  textContentType="newPassword"
                  autoComplete="new-password"
                  value={password}
                  onChangeText={setPassword}
                />
                <Text className="text-xs font-medium text-muted-foreground">8 characters or more.</Text>
              </Field>
              {error && <Text accessibilityLiveRegion="polite" accessibilityRole="alert" className="text-destructive text-sm">{error}</Text>}
              <Button className="mt-2" disabled={busy || !email.includes("@") || password.length < 8} onPress={onCreate}>
                {busy ? "Creating…" : "Create account"}
              </Button>
              <Text className="text-center text-xs font-medium text-muted-foreground">
                Your data is yours — never sold, never used for ads.
              </Text>
            </View>
          </>
        )}

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
