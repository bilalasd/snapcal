import { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { fetchJson, tzOffsetMinutes } from "../lib/api";
import { Bevi } from "../components/bevi";
import { Button, Kicker, Spinner } from "../components/ui";
import { useColors } from "../lib/colors";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "How's my protein this week?",
  "Why did my target change?",
  "What should I eat out tonight?",
];

/** Ask Bevi — questions over your own data plus general nutrition.
 *  History is session-only component state; the server keeps nothing. */
export default function AskBevi() {
  const router = useRouter();
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const { reply } = await fetchJson<{ reply: string }>("/api/ask", {
        method: "POST",
        body: JSON.stringify({ messages: next, tz_offset: tzOffsetMinutes() }),
      });
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages([
        ...next,
        {
          role: "assistant",
          content:
            err instanceof Error ? err.message : "That one stumped Bevi — try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-start justify-between px-5 pb-3 pt-4">
        <View>
          <Kicker>Control room · Ask Bevi</Kicker>
          <Text className="mt-1 text-3xl font-black tracking-tight text-foreground">
            Ask Bevi
          </Text>
        </View>
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Close Ask Bevi"
          onPress={() => router.back()}
        >
          <Feather name="x" size={22} color={colors.foreground} />
        </Button>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1 px-5"
        contentContainerClassName="gap-3 pb-4"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View className="items-center gap-4 pt-10">
            <Bevi pose="clipboard" size={110} />
            <Text className="px-6 text-center text-sm text-muted-foreground">
              Your data, my honest read. Personal answers come from your log and
              your scale — everything else is general guidance, not medical advice.
            </Text>
            <View className="w-full gap-2 pt-2">
              {STARTERS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => void send(s)}
                  className="rounded-2xl border border-border bg-muted px-4 py-3 active:opacity-70"
                >
                  <Text className="text-sm font-semibold text-foreground">{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <View
                key={i}
                className="max-w-[80%] self-end rounded-2xl rounded-br-md bg-foreground px-4 py-2.5"
              >
                <Text className="text-sm text-background">{m.content}</Text>
              </View>
            ) : (
              <View key={i} className="flex-row items-end gap-2 self-start pr-10">
                <Bevi pose="standing" size={28} />
                <View className="flex-1 rounded-2xl rounded-bl-md bg-muted px-4 py-2.5">
                  <Text className="text-sm leading-5 text-foreground">{m.content}</Text>
                </View>
              </View>
            ),
          )
        )}
        {busy ? (
          <View className="flex-row items-center gap-2 self-start pl-1">
            <Spinner color={colors.mutedForeground} />
            <Text className="text-xs text-muted-foreground">Bevi's checking the logs…</Text>
          </View>
        ) : null}
      </ScrollView>

      <View className="flex-row items-center gap-2 border-t border-border px-4 pb-6 pt-3">
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask about your week…"
          placeholderTextColor={colors.mutedForeground}
          className="flex-1 rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-foreground"
          multiline
          maxLength={1000}
          editable={!busy}
          onSubmitEditing={() => void send(input)}
        />
        <Button
          size="icon"
          accessibilityLabel="Send question"
          disabled={busy || !input.trim()}
          onPress={() => void send(input)}
        >
          <Feather name="arrow-up" size={20} color={colors.background} />
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
