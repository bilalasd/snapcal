import { useEffect, useState } from "react";
import { View, Text, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { AuditStats } from "@loggi/shared";
import { Bevi } from "./bevi";
import { Button, Card, Badge, Kicker } from "./ui";
import { block } from "../lib/colors";
import {
  disableMondayNote,
  dismissWeek,
  enableMondayNote,
  getDismissedWeek,
  getMondayNotePref,
  rememberGoal,
} from "../lib/monday-note";

export interface MondayNote {
  weekStart: string;
  content: string;
  verdictStatus: "collecting" | "on_track" | "adjust";
  /** This week's adaptive goal, null when the smart goal is off/unavailable. */
  goalKcal: number | null;
  /** Logged vs measured vs formula burn; null when guards fail (see spec). */
  audit: AuditStats | null;
}

const VERDICT: Record<MondayNote["verdictStatus"], { label: string; bg: string }> = {
  on_track: { label: "Working", bg: "bg-block-mint" },
  adjust: { label: "Adjust", bg: "bg-block-coral" },
  collecting: { label: "Still collecting", bg: "bg-white/60" },
};

/** The weekly TREND DESK note on Today: verdict chip, goal change, recap prose.
 *  Visibility (dismissed-per-week) and the one-time notification offer are
 *  managed here so the parent only decides "is there a recap to show". */
export function MondayNoteCard({
  note,
  showBevi,
  onVisible,
}: {
  note: MondayNote;
  showBevi: boolean;
  onVisible?: (visible: boolean) => void;
}) {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  // "off" until loaded so the offer row never flashes for users who answered.
  const [pref, setPref] = useState<"on" | "off" | null>("off");
  const [prevGoal, setPrevGoal] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      getDismissedWeek(),
      getMondayNotePref(),
      rememberGoal(note.weekStart, note.goalKcal),
    ]).then(([dismissed, p, prev]) => {
      if (!alive) return;
      setHidden(dismissed === note.weekStart);
      setPref(p);
      setPrevGoal(prev);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [note.weekStart, note.goalKcal]);

  const visible = ready && !hidden;
  useEffect(() => {
    onVisible?.(visible);
  }, [visible, onVisible]);

  if (!visible) return null;

  const verdict = VERDICT[note.verdictStatus];
  const goalChanged =
    note.goalKcal != null && prevGoal != null && prevGoal !== note.goalKcal;
  const weekLabel = new Date(`${note.weekStart}T12:00:00`).toLocaleDateString([], {
    month: "long",
    day: "numeric",
  });

  function dismiss() {
    setHidden(true);
    void dismissWeek(note.weekStart);
  }

  async function acceptNotify() {
    setPref("on");
    const ok = await enableMondayNote();
    if (!ok) {
      setPref("off");
      Alert.alert(
        "Notifications are off",
        "Turn on notifications for Loggi in system Settings, then flip on the Monday note in Loggi's Settings.",
      );
    }
  }

  function declineNotify() {
    setPref("off");
    void disableMondayNote();
  }

  return (
    <Card style={{ backgroundColor: block.lilac, borderColor: "transparent" }} className="p-4">
      <View className="flex-row items-start gap-2">
        <View className="min-w-0 flex-1">
          <Kicker className="text-black/60">Trend desk · week of {weekLabel}</Kicker>
          <Text className="mt-1 text-2xl font-black tracking-tight text-black">
            Bevi's Monday note
          </Text>
        </View>
        <Badge className={verdict.bg}>
          <Text className="text-xs font-bold uppercase text-black">{verdict.label}</Text>
        </Badge>
        <Button variant="ghost" size="icon" accessibilityLabel="Dismiss Monday note" onPress={dismiss}>
          <Feather name="x" size={18} color="#000" />
        </Button>
      </View>

      {goalChanged ? (
        <Text className="mt-2 text-sm font-black text-black">
          New target: {note.goalKcal!.toLocaleString()} cal/day — was {prevGoal!.toLocaleString()}
        </Text>
      ) : null}

      <Text className="mt-2 text-sm text-black">{note.content}</Text>

      {note.audit ? (
        <View className="mt-3 border-t border-black/15 pt-3">
          <Kicker className="text-black/60">The audit</Kicker>
          <View className="mt-2 flex-row gap-3">
            {(
              [
                [note.audit.avgIntakeKcal, "Logged"],
                [note.audit.measuredTdeeKcal, "Your burn, measured"],
                [note.audit.formulaTdeeKcal, "Calculator's guess"],
              ] as const
            ).map(([value, label]) => (
              <View key={label} className="flex-1">
                <Text className="text-lg font-black tracking-tight text-black">
                  {value.toLocaleString()}
                </Text>
                <Text className="text-[11px] font-semibold text-black/60">{label}</Text>
              </View>
            ))}
          </View>
          <Text className="mt-2 text-xs text-black">
            {Math.abs(note.audit.driftKcal) >= 100
              ? `A calculator would've missed your burn by ~${Math.abs(
                  note.audit.driftKcal,
                ).toLocaleString()} cal/day. Could be portions, could be the formula — either way, your target used the measured number.`
              : "Your logs and your scale agree within 100 cal. Tight bookkeeping."}
          </Text>
        </View>
      ) : null}

      {pref === null ? (
        <View className="mt-3 flex-row items-center gap-2 border-t border-black/15 pt-3">
          {showBevi ? <Bevi pose="wave" size={44} /> : null}
          <Text className="flex-1 text-xs font-semibold text-black">
            Want this as a note every Monday morning?
          </Text>
          <Button size="sm" hitSlop={8} onPress={() => void acceptNotify()}>
            Notify me
          </Button>
          <Button variant="ghost" size="sm" hitSlop={8} onPress={declineNotify}>
            <Text className="font-bold text-black/60">No thanks</Text>
          </Button>
        </View>
      ) : null}
    </Card>
  );
}
