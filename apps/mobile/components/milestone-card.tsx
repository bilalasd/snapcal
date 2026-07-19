import { useRef, useState } from "react";
import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import ViewShot, { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { Bevi } from "./bevi";
import { Button, Card, Kicker } from "../components/ui";
import { block, useColors } from "../lib/colors";
import type { Milestone } from "../lib/milestones";

/** A warm, building-themed milestone with a share offer. Nothing auto-posts —
 *  Share renders the branded card to an image and opens the system sheet.
 *  No weight or body numbers ever appear here (doctrine §5). */
export function MilestoneCard({
  milestone,
  onDone,
}: {
  milestone: Milestone;
  onDone: () => void;
}) {
  const shotRef = useRef<View>(null);
  const colors = useColors();
  const [sharing, setSharing] = useState(false);

  async function share() {
    setSharing(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }
      onDone();
    } catch {
      setSharing(false);
    }
  }

  return (
    <>
      <Card style={{ backgroundColor: block.lime, borderColor: "transparent" }} className="p-4">
        <View className="flex-row items-center gap-3">
          <Bevi pose="celebrate" size={56} />
          <View className="min-w-0 flex-1">
            <Kicker className="text-black/60">Milestone</Kicker>
            <Text className="text-lg font-black leading-tight tracking-tight text-black">
              {milestone.headline}
            </Text>
            <Text className="mt-0.5 text-xs font-semibold text-black/70">{milestone.sub}</Text>
          </View>
        </View>
        <View className="mt-3 flex-row items-center gap-2">
          <Button size="sm" disabled={sharing} onPress={() => void share()}>
            <Feather name="share" size={14} color={colors.background} />
            <Text className="font-bold text-primary-foreground">Share it</Text>
          </Button>
          <Button variant="ghost" size="sm" onPress={onDone}>
            <Text className="font-bold text-black/60">Not now</Text>
          </Button>
        </View>
      </Card>

      {/* Offscreen share graphic — square, print-flavored, captured by ref. */}
      <View style={{ position: "absolute", left: -9999 }} pointerEvents="none">
        <ViewShot ref={shotRef}>
          <View style={{ width: 360, height: 360, backgroundColor: block.lime, padding: 28, justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: 11, fontWeight: "900", letterSpacing: 2, color: "rgba(0,0,0,0.6)" }}>
                BUILT WITH LOGGI
              </Text>
              <Text style={{ marginTop: 10, fontSize: 30, lineHeight: 34, fontWeight: "900", letterSpacing: -0.5, color: "#000" }}>
                {milestone.headline}
              </Text>
              <Text style={{ marginTop: 8, fontSize: 14, fontWeight: "600", color: "rgba(0,0,0,0.7)" }}>
                {milestone.sub}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, fontWeight: "800", color: "#000" }}>loggi</Text>
              <Bevi pose="celebrate" size={96} />
            </View>
          </View>
        </ViewShot>
      </View>
    </>
  );
}
