"use client";

import { useState } from "react";
import { HelpCircle, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ClarifyAnswer } from "@/lib/clarify";
import type { ClarifyQuestion } from "@/lib/client";

interface QuestionsStepProps {
  questions: ClarifyQuestion[];
  busy?: boolean;
  onDone: (answers: ClarifyAnswer[]) => void;
}

/**
 * Dedicated full-screen step for the AI's clarifying questions. Shown after
 * analysis when there's at least one question, before the review screen. Walks
 * through the questions one at a time with a counter, tappable answers, a
 * free-text fallback, and a skip. Collects every answer, then hands them back.
 */
export function QuestionsStep({ questions, busy, onDone }: QuestionsStepProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<ClarifyAnswer[]>([]);
  const [text, setText] = useState("");

  const question = questions[index];
  const isLast = index === questions.length - 1;

  function advance(answer: ClarifyAnswer) {
    const next = [...answers, answer];
    if (isLast) {
      onDone(next);
    } else {
      setAnswers(next);
      setIndex(index + 1);
      setText("");
    }
  }

  return (
    <div className="flex min-h-[70dvh] flex-col gap-6">
      <section>
        <p className="editorial-kicker flex items-center gap-1.5 text-primary-strong">
          <HelpCircle className="size-4" /> Quick question
        </p>
        <h1 className="editorial-headline mt-1">Help me get it right</h1>
      </section>

      {/* Progress: counter + dots */}
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-xs font-extrabold uppercase tracking-[0.14em]">
          Question {index + 1} of {questions.length}
        </span>
        <div className="flex flex-1 gap-1.5">
          {questions.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-none transition-colors",
                i <= index ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>
      </div>

      <div className="block-surface bg-block-lilac editorial-cut flex flex-col gap-4 p-4">
        <p className="text-xl font-black tracking-[-0.03em]">
          {question.question}
        </p>

        <div className="flex flex-wrap gap-2">
          {question.options.map((option) => (
            <Button
              key={option.label}
              variant="outline"
              disabled={busy}
              className="bg-card"
              onClick={() =>
                advance({
                  kind: "option",
                  question: question.question,
                  label: option.label,
                  items: option.items,
                })
              }
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="relative">
          <Textarea
            placeholder="…or type your own answer"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            disabled={busy}
            className="bg-card"
          />
          <Button
            size="sm"
            className="absolute bottom-2 right-2"
            disabled={busy || !text.trim()}
            onClick={() =>
              advance({
                kind: "text",
                question: question.question,
                text: text.trim(),
              })
            }
          >
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Send
          </Button>
        </div>
      </div>

      <Button
        variant="ghost"
        className="text-muted-foreground"
        disabled={busy}
        onClick={() => advance({ kind: "skip" })}
      >
        <SkipForward data-icon="inline-start" />
        {isLast ? "Skip & review" : "Skip this question"}
      </Button>
    </div>
  );
}
