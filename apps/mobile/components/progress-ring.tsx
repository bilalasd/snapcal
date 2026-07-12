import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";

interface ProgressRingProps {
  value: number;
  max: number;
  label: string;
  sublabel: string;
  size?: "default" | "compact";
}

export function ProgressRing({ value, max, label, sublabel, size = "default" }: ProgressRingProps) {
  const radius = 84;
  const stroke = 16;
  const circumference = 2 * Math.PI * radius;
  const fraction = max > 0 ? Math.min(value / max, 1) : 0;
  const over = max > 0 && value > max;
  const px = size === "compact" ? 128 : 208;

  return (
    <View className="items-center">
      <View style={{ width: px, height: px }}>
        <Svg viewBox="0 0 200 200" width={px} height={px} style={{ transform: [{ rotate: "-90deg" }] }}>
          <Circle cx={100} cy={100} r={radius} fill="none" strokeWidth={stroke} stroke="#f7f7f5" />
          <Circle
            cx={100}
            cy={100}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            stroke={over ? "#d92d20" : "#000000"}
          />
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text
            className={`font-black tracking-tighter tabular-nums ${size === "compact" ? "text-2xl" : "text-4xl"} ${over ? "text-destructive" : "text-foreground"}`}
          >
            {label}
          </Text>
          <Text className="text-muted-foreground text-xs font-bold uppercase tracking-[2px]">
            {sublabel}
          </Text>
        </View>
      </View>
    </View>
  );
}
