import { useState } from "react";
import { View, Text, type LayoutChangeEvent } from "react-native";
import Svg, { Rect, Line, Circle, Path, Text as SvgText } from "react-native-svg";
import { useColors } from "../lib/colors";

// Small react-native-svg charts. Width is measured from the parent via onLayout
// so they fill the card; height is fixed per chart. Colors route through
// useColors() so the mono ramp flips with the theme: primary series =
// foreground, secondary = mutedForeground, over-target = destructive.

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(e.nativeEvent.layout.width)];
}

/** Calorie bars with a dashed goal line and a minimal y-axis scale. */
export function BarChart({
  data,
  goal,
  height = 176,
}: {
  data: { label: string; value: number }[];
  goal?: number;
  height?: number;
}) {
  const c = useColors();
  const [width, onLayout] = useWidth();
  const padL = 30;
  const padB = 18;
  const padT = 10; // keeps the top tick label off the card edge
  const chartH = height - padB;
  const chartW = Math.max(width - padL, 1);
  const max = Math.max(goal ?? 0, ...data.map((d) => d.value), 1) * 1.1;
  const n = data.length || 1;
  const slot = chartW / n;
  const barW = Math.max(slot * 0.6, 2);
  const loggedDays = data.filter((d) => d.value > 0);
  const avg = loggedDays.length ? Math.round(loggedDays.reduce((s, d) => s + d.value, 0) / loggedDays.length) : 0;

  const y = (v: number) => padT + (1 - v / max) * (chartH - padT);
  const yTicks = [max, max / 2];

  return (
    <View
      onLayout={onLayout}
      style={{ height }}
      accessible
      accessibilityLabel={`Calorie chart, last ${n} days. Average ${avg} calories on logged days${goal ? `, goal ${goal}` : ""}.`}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {yTicks.map((t, i) => (
            <SvgText key={i} x={0} y={y(t) + 3} fontSize={11} fill={c.mutedForeground}>
              {Math.round(t)}
            </SvgText>
          ))}
          {goal ? (
            <Line
              x1={padL}
              y1={y(goal)}
              x2={width}
              y2={y(goal)}
              stroke={c.mutedForeground}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}
          {data.map((d, i) => {
            const top = y(d.value);
            const h = Math.max(chartH - top, d.value > 0 ? 2 : 0);
            const x = padL + i * slot + (slot - barW) / 2;
            const over = goal != null && d.value > goal;
            return (
              <Rect key={i} x={x} y={chartH - h} width={barW} height={h} rx={3} fill={over ? c.destructive : c.foreground} />
            );
          })}
          {/* Sparse x labels: first, middle, last (deduped for tiny datasets) */}
          {[...new Set([0, Math.floor(n / 2), n - 1])].map((i) =>
            data[i] ? (
              <SvgText
                key={i}
                x={padL + i * slot + slot / 2}
                y={height - 4}
                fontSize={11}
                fill={c.mutedForeground}
                textAnchor="middle"
              >
                {data[i].label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      ) : null}
    </View>
  );
}

/** Weight: faded measured dots + a smooth trend line, auto y-domain. */
export function WeightChart({
  points,
  goal,
  height = 208,
}: {
  points: { measured: number; trend: number; label: string }[];
  goal?: number;
  height?: number;
}) {
  const c = useColors();
  const [width, onLayout] = useWidth();
  const padL = 34;
  const padB = 18;
  const padT = 10; // keeps the top y-tick label from clipping at the card edge
  const chartH = height - padB;
  const chartW = Math.max(width - padL, 1);

  // Goal is part of the domain so the target line is always on screen.
  const vals = points.flatMap((p) => [p.measured, p.trend]).concat(goal != null ? [goal] : []);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const lo = min - range * 0.1;
  const hi = max + range * 0.1;

  const n = points.length;
  const x = (i: number) => padL + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (chartH - padT);

  const trendPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.trend).toFixed(1)}`)
    .join(" ");

  const yTicks = [lo, (lo + hi) / 2, hi];
  const last = points[n - 1];

  return (
    <View
      accessible
      accessibilityLabel={
        last
          ? `Weight chart, ${n} entries. Latest ${last.measured}, trend ${last.trend}${goal != null ? `, goal ${goal}` : ""}.`
          : "Weight chart, no entries yet."
      }
    >
      <View className="mb-2 flex-row items-center gap-4">
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.mutedForeground, opacity: 0.6 }} />
          <Text className="text-muted-foreground text-xs">Measured</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 12, height: 2.5, borderRadius: 2, backgroundColor: c.foreground }} />
          <Text className="text-muted-foreground text-xs">Trend</Text>
        </View>
      </View>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 && n > 0 ? (
          <Svg width={width} height={height}>
            {yTicks.map((t, i) => (
              <SvgText key={i} x={0} y={y(t) + 3} fontSize={11} fill={c.mutedForeground}>
                {Math.round(t * 10) / 10}
              </SvgText>
            ))}
            {goal != null ? (
              <Line x1={padL} y1={y(goal)} x2={width} y2={y(goal)} stroke={c.mutedForeground} strokeWidth={1} strokeDasharray="4 4" />
            ) : null}
            {points.map((p, i) => (
              <Circle key={i} cx={x(i)} cy={y(p.measured)} r={2.5} fill={c.mutedForeground} opacity={0.5} />
            ))}
            <Path d={trendPath} stroke={c.foreground} strokeWidth={2.5} fill="none" />
            {[...new Set([0, n - 1])].map((i) =>
              points[i] ? (
                <SvgText key={i} x={x(i)} y={height - 4} fontSize={11} fill={c.mutedForeground} textAnchor={i === 0 ? "start" : "end"}>
                  {points[i].label}
                </SvgText>
              ) : null,
            )}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}
