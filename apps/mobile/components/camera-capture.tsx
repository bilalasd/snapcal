import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Linking, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import Svg, { Rect, Defs, Mask } from "react-native-svg";
import { Feather } from "@expo/vector-icons";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const HOLD_MS = 3000; // same code must stay in frame this long before lookup fires
const LOST_MS = 700; // no detections for this long = the code left the frame
const EDGE = 24; // a code must sit fully on-screen by this margin to count
const PAD = 22; // breathing room between detected bounds and brackets
const HOLE_R = 18; // corner radius of the clear (non-dimmed) window
const CORNER = 30;
const STROKE = 5;
const TRACE_W = 6; // the hold-progress border that walks the box perimeter

// Capture layer (2026-07-18): expo-camera is the camera — vision-camera v5
// corrupted the Hermes heap on-device and a v4 rebuild wasn't reliable. The
// Walmart-style reticle below (see ScreenRecording_07-14-2026 in repo root)
// is pure reanimated UI driven by expo-camera's native barcode events:
// white corner brackets rest at center, morph in and turn yellow on a
// detected code, the screen dims outside a rounded clear window, and a thick
// yellow border traces the box over 3s — only then does the lookup fire.

// One camera for all three: the shutter captures food or a nutrition label
// (→ AI analyze, which reads both); a barcode held in frame for HOLD_MS
// auto-fires an Open Food Facts lookup. `busy` covers the lookup in progress.
export function CameraCapture({
  open,
  onClose,
  onPhoto,
  onBarcode,
  onLibrary,
  onMenuScout,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onPhoto: (uri: string) => void;
  onBarcode: (code: string) => void;
  onLibrary?: () => void;
  onMenuScout?: () => void;
  busy?: boolean;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { width: winW, height: winH } = useWindowDimensions();
  const camRef = useRef<CameraView>(null);
  const fired = useRef(false);
  const seenAt = useRef<{ code: string; t: number } | null>(null);
  const lostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [capturing, setCapturing] = useState(false);

  // Walmart-style reticle, invisible until a code is found: yellow corner
  // brackets appear slightly outside the barcode and contract onto it, the
  // screen dims around a clear window, and the hold border fills. The trace's
  // dash geometry is FROZEN at hold start (tracePerim) — animating dashes
  // against live-changing dimensions makes the sweep visibly rebase.
  const boxX = useSharedValue(0);
  const boxY = useSharedValue(0);
  const boxW = useSharedValue(0);
  const boxH = useSharedValue(0);
  const active = useSharedValue(0); // 0 = hidden → 1 = locked (yellow, dimmed)
  const progress = useSharedValue(0); // hold border, 0→1 over HOLD_MS
  const tracePerim = useSharedValue(1); // frozen box perimeter for a stable sweep

  function resetReticle() {
    cancelAnimation(progress);
    progress.value = 0;
    seenAt.current = null;
    active.value = withTiming(0, { duration: reduce ? 0 : 130 });
  }

  // One barcode per arming: re-arm whenever the camera (re)opens or a lookup
  // settles — a miss keeps the camera open for an immediate retry.
  useEffect(() => {
    if (open && !busy) {
      fired.current = false;
      resetReticle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);
  useEffect(() => () => {
    if (lostTimer.current) clearTimeout(lostTimer.current);
  }, []);

  function onScanned({ data, bounds }: BarcodeScanningResult) {
    if (fired.current || busy || capturing || !data) return;

    // Without usable bounds we can't verify the code is actually visible —
    // never lock or hold on something we can't place on screen.
    if (!bounds || bounds.size.width <= 0) return;

    // iOS has reported bounds in view points or normalized 0–1 — scale up if
    // it looks normalized.
    const norm = bounds.size.width <= 1;
    const rawX = bounds.origin.x * (norm ? winW : 1);
    const rawY = bounds.origin.y * (norm ? winH : 1);
    const rawW = bounds.size.width * (norm ? winW : 1);
    const rawH = bounds.size.height * (norm ? winH : 1);
    // A code hanging off (or hugging) the screen edge is one the user isn't
    // aiming at — ignore it entirely.
    if (rawX < EDGE || rawY < EDGE || rawX + rawW > winW - EDGE || rawY + rawH > winH - EDGE) return;

    const now = Date.now();
    const isNewFix = !seenAt.current || seenAt.current.code !== data;
    const bx = rawX - PAD;
    const by = rawY - PAD;
    const bw = rawW + PAD * 2;
    const bh = rawH + PAD * 2;
    if (isNewFix) {
      // Appear slightly outside the code and contract onto it.
      const inset = 0.08;
      boxX.value = bx - bw * inset;
      boxY.value = by - bh * inset;
      boxW.value = bw * (1 + inset * 2);
      boxH.value = bh * (1 + inset * 2);
      const t = { duration: reduce ? 0 : 240, easing: Easing.out(Easing.cubic) };
      boxX.value = withTiming(bx, t);
      boxY.value = withTiming(by, t);
      boxW.value = withTiming(bw, t);
      boxH.value = withTiming(bh, t);
      tracePerim.value = 2 * (bw + bh);
    } else {
      // Track tight: detection events already lag reality, so keep the
      // smoothing short or the box visibly trails a moving code.
      const t = { duration: reduce ? 0 : 120, easing: Easing.out(Easing.quad) };
      boxX.value = withTiming(bx, t);
      boxY.value = withTiming(by, t);
      boxW.value = withTiming(bw, t);
      boxH.value = withTiming(bh, t);
    }
    active.value = withTiming(1, { duration: reduce ? 0 : 200 });

    // No "lost" event exists — silence for LOST_MS means it left the frame.
    if (lostTimer.current) clearTimeout(lostTimer.current);
    lostTimer.current = setTimeout(resetReticle, LOST_MS);

    if (isNewFix) {
      seenAt.current = { code: data, t: now };
      cancelAnimation(progress);
      progress.value = 0;
      // Determinate progress — linear on purpose (DESIGN.md §2.8 exception).
      progress.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear });
    } else if (seenAt.current && now - seenAt.current.t >= HOLD_MS) {
      fired.current = true;
      seenAt.current = null;
      if (lostTimer.current) clearTimeout(lostTimer.current); // stay locked during lookup
      onBarcode(data);
    }
  }

  const boxStyle = useAnimatedStyle(() => ({
    left: boxX.value,
    top: boxY.value,
    width: boxW.value,
    height: boxH.value,
    opacity: active.value,
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: active.value }));
  const holeProps = useAnimatedProps(() => ({
    x: boxX.value,
    y: boxY.value,
    width: boxW.value,
    height: boxH.value,
  }));
  // The hold border walks the box perimeter as `progress` fills. Dash
  // geometry uses the frozen perimeter so the sweep never rebases mid-hold.
  const traceProps = useAnimatedProps(() => ({
    x: boxX.value,
    y: boxY.value,
    width: boxW.value,
    height: boxH.value,
    strokeDasharray: `${tracePerim.value}`,
    strokeDashoffset: tracePerim.value * (1 - progress.value),
    opacity: active.value,
  }));

  async function snap() {
    if (capturing || busy) return;
    setCapturing(true);
    try {
      const pic = await camRef.current?.takePictureAsync({ quality: 0.9 });
      if (pic?.uri) onPhoto(pic.uri);
    } catch {
      // Capture failed (e.g. no camera on the simulator) — stay open, no crash.
    } finally {
      setCapturing(false);
    }
  }

  const corner = (pos: "tl" | "tr" | "bl" | "br") => (
    <View
      key={pos}
      style={{
        position: "absolute",
        width: CORNER,
        height: CORNER,
        borderColor: "#facc15",
        ...(pos === "tl" && { top: 0, left: 0, borderTopWidth: STROKE, borderLeftWidth: STROKE, borderTopLeftRadius: 10 }),
        ...(pos === "tr" && { top: 0, right: 0, borderTopWidth: STROKE, borderRightWidth: STROKE, borderTopRightRadius: 10 }),
        ...(pos === "bl" && { bottom: 0, left: 0, borderBottomWidth: STROKE, borderLeftWidth: STROKE, borderBottomLeftRadius: 10 }),
        ...(pos === "br" && { bottom: 0, right: 0, borderBottomWidth: STROKE, borderRightWidth: STROKE, borderBottomRightRadius: 10 }),
      }}
    />
  );

  // Rendered inline (the /add route is already a fullscreen modal) — a nested
  // RN Modal here left a black sheet visibly dismissing after the camera closed.
  if (!open) return null;
  return (
    <View className="flex-1 bg-black">
      {permission?.granted ? (
        <CameraView
          ref={camRef}
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
          onBarcodeScanned={busy || capturing ? undefined : onScanned}
        />
      ) : (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Feather name="camera-off" size={40} color="#fff" />
          <Text className="text-center text-base text-white">
            Camera access is needed to log meals.
          </Text>
          {/* After a hard denial the OS won't re-show the prompt — send them to Settings. */}
          <Pressable
            className="rounded-2xl bg-white px-5 py-3 active:opacity-80"
            onPress={() => (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission())}
          >
            <Text className="font-bold text-black">
              {permission?.canAskAgain === false ? "Open Settings" : "Grant access"}
            </Text>
          </Pressable>
        </View>
      )}

      {permission?.granted ? (
        <>
          {/* Dim outside the locked box, with a rounded clear window that tracks it */}
          <Animated.View
            pointerEvents="none"
            style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, dimStyle]}
          >
            <Svg width={winW} height={winH}>
              <Defs>
                <Mask id="scanHole">
                  <Rect x={0} y={0} width={winW} height={winH} fill="white" />
                  <AnimatedRect animatedProps={holeProps} rx={HOLE_R} ry={HOLE_R} fill="black" />
                </Mask>
              </Defs>
              <Rect x={0} y={0} width={winW} height={winH} fill="rgba(0,0,0,0.45)" mask="url(#scanHole)" />
            </Svg>
          </Animated.View>

          {/* Hold border: thick yellow stroke walking the perimeter over HOLD_MS */}
          <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
            <Svg width={winW} height={winH}>
              <AnimatedRect
                animatedProps={traceProps}
                rx={HOLE_R}
                ry={HOLE_R}
                fill="none"
                stroke="#facc15"
                strokeWidth={TRACE_W}
                strokeLinecap="round"
              />
            </Svg>
          </View>

          {/* Corner brackets: hidden until a code is found, then contract onto it */}
          <Animated.View pointerEvents="none" style={[{ position: "absolute" }, boxStyle]}>
            {corner("tl")}
            {corner("tr")}
            {corner("bl")}
            {corner("br")}
          </Animated.View>
        </>
      ) : null}

      {/* Hint */}
      <View className="absolute inset-x-0 top-16 items-center" pointerEvents="none">
        <Text className="overflow-hidden rounded-full bg-black/55 px-4 py-2 text-sm font-semibold text-white">
          {busy ? "Looking up barcode…" : "Snap food or a label — or hold on a barcode"}
        </Text>
      </View>

      {/* Shutter + library */}
      {permission?.granted ? (
        <View className="absolute inset-x-0 items-center justify-center" style={{ bottom: Math.max(insets.bottom, 16) + 32 }}>
          <Pressable
            onPress={snap}
            disabled={capturing || busy}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            className="h-20 w-20 items-center justify-center rounded-full border-4 border-white active:opacity-70"
          >
            <View className="h-16 w-16 rounded-full bg-white" />
          </Pressable>
          {onLibrary ? (
            <Pressable
              onPress={onLibrary}
              disabled={capturing || busy}
              className="absolute left-8 h-12 w-12 items-center justify-center rounded-full bg-black/50 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="Choose from library"
            >
              <Feather name="image" size={20} color="#fff" />
            </Pressable>
          ) : null}
          {onMenuScout ? (
            <Pressable
              onPress={onMenuScout}
              disabled={capturing || busy}
              className="absolute right-8 h-12 w-12 items-center justify-center rounded-full bg-black/50 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="Scan a restaurant menu"
            >
              <Feather name="book-open" size={20} color="#fff" />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Close */}
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close camera"
        className="absolute right-5 h-11 w-11 items-center justify-center rounded-full bg-black/50 active:opacity-70"
        style={{ top: Math.max(insets.top, 20) + 8 }}
      >
        <Feather name="x" size={22} color="#fff" />
      </Pressable>

      {/* Spinner only while a photo is being captured — barcode lookup shows
          the locked reticle + "Looking up…" hint instead. */}
      {capturing ? (
        <View className="absolute inset-0 items-center justify-center bg-black/30" pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}
    </View>
  );
}
