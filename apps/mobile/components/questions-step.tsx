import { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import type { ClarifyAnswer, ClarifyQuestion } from "@mealio/shared";
import { Button, Input, Kicker } from "./ui";

/**
 * Dedicated step for the AI's clarifying questions, shown after analysis before
 * review. One question at a time with a counter, tappable answers, free-text
 * fallback, and skip. Collects every answer, then hands them back.
 */
export function QuestionsStep({
  questions,
  onDone,
}: {
  questions: ClarifyQuestion[];
  onDone: (answers: ClarifyAnswer[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<ClarifyAnswer[]>([]);
  const [text, setText] = useState("");

  const question = questions[index];
  const isLast = index === questions.length - 1;

  function advance(answer: ClarifyAnswer) {
    const next = [...answers, answer];
    if (isLast) onDone(next);
    else {
      setAnswers(next);
      setIndex(index + 1);
      setText("");
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerClassName="p-5 gap-6">
        <View>
          <View className="flex-row items-center gap-1.5">
            <Feather name="help-circle" size={16} color="#000" />
            <Kicker>Quick question</Kicker>
          </View>
          <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">Help me get it right</Text>
        </View>

        <View className="flex-row items-center gap-3">
          <Text className="text-muted-foreground text-xs font-extrabold uppercase tracking-wider">
            Question {index + 1} of {questions.length}
          </Text>
          <View className="flex-1 flex-row gap-1.5">
            {questions.map((_, i) => (
              <View key={i} className={`h-1.5 flex-1 ${i <= index ? "bg-primary" : "bg-muted"}`} />
            ))}
          </View>
        </View>

        <View className="gap-4 rounded-3xl bg-block-lilac p-4">
          <Text className="text-xl font-black tracking-tight text-foreground">{question.question}</Text>

          <View className="flex-row flex-wrap gap-2">
            {question.options.map((option) => (
              <Button
                key={option.label}
                variant="outline"
                className="bg-card"
                onPress={() => advance({ kind: "option", question: question.question, label: option.label, items: option.items })}
              >
                {option.label}
              </Button>
            ))}
          </View>

          <View>
            <Input
              placeholder="…or type your own answer"
              value={text}
              onChangeText={setText}
              className="bg-card"
              multiline
            />
            <Button
              size="sm"
              className="mt-2 self-end"
              disabled={!text.trim()}
              onPress={() => advance({ kind: "text", question: question.question, text: text.trim() })}
            >
              Send
            </Button>
          </View>
        </View>

        <Button variant="ghost" onPress={() => advance({ kind: "skip" })}>
          <Feather name="skip-forward" size={16} color="#565656" />
          <Text className="font-bold text-muted-foreground">{isLast ? "Skip & review" : "Skip this question"}</Text>
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
