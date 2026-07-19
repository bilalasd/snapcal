import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Linking, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Bevi } from "./bevi";
import { Button, Kicker } from "./ui";
import { useColors } from "../lib/colors";

// Dictate-a-meal: starts listening the moment it mounts (the speed dial's
// slide-to-mic release lands here), shows the words live, and hands the final
// transcript to the same analyze flow a typed description uses. On-device
// recognition (Apple/Google) — audio never leaves the phone.
export function SpeakCapture({
  onTranscript,
  onClose,
  onFallback,
}: {
  onTranscript: (text: string) => void;
  onClose: () => void;
  onFallback: () => void; // hand off to describe-by-text
}) {
  const colors = useColors();
  const [status, setStatus] = useState<"starting" | "listening" | "denied" | "silent">("starting");
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  // Refs so the module-level event listeners never act on stale state.
  const done = useRef(false);
  const textRef = useRef("");

  function begin() {
    setStatus("starting");
    setFinalText("");
    setInterim("");
    textRef.current = "";
    done.current = false;
    ExpoSpeechRecognitionModule.requestPermissionsAsync().then(({ granted }) => {
      if (!granted) {
        setStatus("denied");
        return;
      }
      // No `lang` — the recognizer uses the device locale.
      ExpoSpeechRecognitionModule.start({ interimResults: true, continuous: true });
    });
  }

  useEffect(() => {
    begin();
    return () => {
      done.current = true;
      ExpoSpeechRecognitionModule.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, []);

  useSpeechRecognitionEvent("start", () => setStatus("listening"));
  useSpeechRecognitionEvent("result", (e) => {
    const transcript = e.results[0]?.transcript ?? "";
    if (e.isFinal) {
      setFinalText((prev) => {
        const next = [prev, transcript].filter(Boolean).join(" ");
        textRef.current = next;
        return next;
      });
      setInterim("");
    } else {
      setInterim(transcript);
      textRef.current = [finalText, transcript].filter(Boolean).join(" ");
    }
  });
  useSpeechRecognitionEvent("error", (e) => {
    if (done.current) return;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") setStatus("denied");
    else setStatus("silent"); // incl. "no-speech" — offer another go, don't scold
  });
  // The recognizer stopped (Done pressed, or the OS's silence timeout). If we
  // heard anything, that IS the meal — submit without another tap.
  useSpeechRecognitionEvent("end", () => {
    if (done.current) return;
    const text = textRef.current.trim();
    if (text) {
      done.current = true;
      onTranscript(text);
    } else {
      setStatus("silent");
    }
  });

  const heard = [finalText, interim].filter(Boolean).join(" ");

  if (status === "denied") {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-background px-8">
        <Feather name="mic-off" size={40} color={colors.mutedForeground} />
        <Text className="text-center text-base text-foreground">
          Loggi needs the mic to hear your meal — everything is transcribed on your phone.
        </Text>
        <Button onPress={() => Linking.openSettings()}>Open Settings</Button>
        <Button variant="ghost" onPress={onFallback}>
          Type it instead
        </Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center justify-between px-5 pt-2">
        <Kicker>Voice desk</Kicker>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          className="h-10 w-10 items-center justify-center active:opacity-60"
        >
          <Feather name="x" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="flex-grow px-5 pb-6" keyboardShouldPersistTaps="handled">
        <Text className="text-4xl font-black tracking-tighter text-foreground">
          {status === "silent" ? "Didn't catch that" : "Tell me what you ate"}
        </Text>
        <Text className="mt-2 text-sm font-semibold text-muted-foreground">
          Like: "two eggs, toast with butter, and an orange juice."
        </Text>

        {/* Live transcript — final words solid, in-flight words muted */}
        <View className="mt-6 min-h-32 flex-1">
          {heard ? (
            <Text className="text-2xl font-bold leading-9 tracking-tight text-foreground">
              {finalText}
              {interim ? <Text className="text-muted-foreground">{finalText ? " " : ""}{interim}</Text> : null}
            </Text>
          ) : status === "listening" ? (
            <View className="flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-full bg-accent-log" />
              <Text className="text-base font-bold text-muted-foreground">Listening…</Text>
            </View>
          ) : null}
        </View>

        <View className="items-center">
          <Bevi pose="clipboard" size={96} />
        </View>
      </ScrollView>

      <View className="gap-2 border-t border-border bg-background px-5 pb-8 pt-3">
        {status === "silent" ? (
          <Button onPress={begin}>
            <Feather name="mic" size={16} color={colors.background} />
            <Text className="text-base font-bold text-primary-foreground">Try again</Text>
          </Button>
        ) : (
          <Button onPress={() => ExpoSpeechRecognitionModule.stop()} disabled={!heard.trim()}>
            <Feather name="check" size={16} color={colors.background} />
            <Text className="text-base font-bold text-primary-foreground">Done — estimate it</Text>
          </Button>
        )}
        <Button variant="ghost" onPress={onFallback}>
          Type it instead
        </Button>
      </View>
    </SafeAreaView>
  );
}
