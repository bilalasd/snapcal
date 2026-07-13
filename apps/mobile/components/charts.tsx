import { useState } from "react";
import { View, Text, type LayoutChangeEvent } from "react-native";
import Svg, { Rect, Line, Circle, Path, Text as SvgText } from "react-native-svg";

// Small react-native-svg charts. Width is measured from the parent via onLayout
// so they fill the card; height is fixed per chart.

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(e.nativeEvent.layout.width)];
}

/** Calorie bars with an optional dashed goal line. */
export function BarChart({
  data,
  goal,
  height = 176,
  color = "#000000",
  overColor = "#d92d20",
}: {
  data: { label: string; value: number }[];
  goal?: number;
  height?: number;
  color?: string;
  overColor?: string;
}) {
  const [width, onLayout] = useWidth();
  const padB = 18;
  const chartH = height - padB;
  const max = Math.max(goal ?? 0, ...data.map((d) => d.value), 1) * 1.1;
  const n = data.length || 1;
  const slot = width / n;
  const barW = Math.max(slot * 0.6, 2);

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {goal ? (
            <Line
              x1={0}
              y1={chartH - (goal / max) * chartH}
              x2={width}
              y2={chartH - (goal / max) * chartH}
              stroke="#565656"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}
          {data.map((d, i) => {
            const h = Math.max((d.value / max) * chartH, d.value > 0 ? 2 : 0);
            const x = i * slot + (slot - barW) / 2;
            const over = goal != null && d.value > goal;
            return (
              <Rect key={i} x={x} y={chartH - h} width={barW} height={h} rx={3} fill={over ? overColor : color} />
            );
          })}
          {/* Sparse x labels: first, middle, last */}
          {[0, Math.floor(n / 2), n - 1].map((i) =>
            data[i] ? (
              <SvgText key={i} x={i * slot + slot / 2} y={height - 4} fontSize={9} fill="#565656" textAnchor="middle">
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
  height = 208,
}: {
  points: { measured: number; trend: number; label: string }[];
  height?: number;
}) {
  const [width, onLayout] = useWidth();
  const padL = 34;
  const padB = 18;
  const chartH = height - padB;
  const chartW = Math.max(width - padL, 1);

  const vals = points.flatMap((p) => [p.measured, p.trend]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const lo = min - range * 0.1;
  const hi = max + range * 0.1;

  const n = points.length;
  const x = (i: number) => padL + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  const y = (v: number) => chartH - ((v - lo) / (hi - lo)) * chartH;

  const trendPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.trend).toFixed(1)}`)
    .join(" ");

  const yTicks = [lo, (lo + hi) / 2, hi];

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 && n > 0 ? (
        <Svg width={width} height={height}>
          {yTicks.map((t, i) => (
            <SvgText key={i} x={0} y={y(t) + 3} fontSize={9} fill="#565656">
              {Math.round(t * 10) / 10}
            </SvgText>
          ))}
          {points.map((p, i) => (
            <Circle key={i} cx={x(i)} cy={y(p.measured)} r={2.5} fill="#6b6b6b" opacity={0.5} />
          ))}
          <Path d={trendPath} stroke="#000000" strokeWidth={2.5} fill="none" />
          {[0, n - 1].map((i) =>
            points[i] ? (
              <SvgText key={i} x={x(i)} y={height - 4} fontSize={9} fill="#565656" textAnchor={i === 0 ? "start" : "end"}>
                {points[i].label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      ) : null}
    </View>
  );
}
