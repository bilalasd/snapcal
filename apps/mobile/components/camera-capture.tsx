import { useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Camera,
  useCameraPermission,
  usePhotoOutput,
  useFrameOutput,
  type CameraRef,
  type Point,
} from "react-native-vision-camera";
import { useBarcodeScanner } from "react-native-vision-camera-barcode-scanner";
import { useTextRecognition } from "react-native-vision-camera-ocr-plus";
import { scheduleOnRN } from "react-native-worklets";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  interpolateColor,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle, Rect, Defs, Mask } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

const HOLD_MS = 3000; // same code must stay in frame this long before lookup fires
const LOST_MS = 700; // no detections for this long = subject left the frame (MLKit rounds take ~100-200ms)
const PAD = 22; // breathing room between detected bounds and brackets
const HOLE_R = 18; // corner radius of the clear (non-dimmed) window
const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;
const CORNER = 30;
const STROKE = 5;

// Nutrition labels are dense multi-block text with telltale words.
const LABEL_WORDS = /calorie|kcal|protein|carbohydrate|total fat|serving|sodium|nutrition|energy/i;

type Detection = { kind: "barcode" | "label"; value: string; tl: Point; br: Point };

// One camera for all three: the shutter captures food or a nutrition label
// (→ AI analyze, which reads both), and a barcode or nutrition label in frame
// is auto-detected by MLKit each frame — barcodes hold-to-fire an Open Food
// Facts lookup, labels just get boxed with a "snap it" hint.
// `busy` covers the barcode lookup in progress.
export function CameraCapture({
  open,
  onClose,
  onPhoto,
  onBarcode,
  onLibrary,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onPhoto: (uri: string) => void;
  onBarcode: (code: string) => void;
  onLibrary?: () => void;
  busy?: boolean;
}) {
  const { hasPermission, requestPermission, canRequestPermission } = useCameraPermission();
  const insets = useSafeAreaInsets();
  const camRef = useRef<CameraRef>(null);
  const firedBarcode = useRef(false);
  const seenAt = useRef<{ code: string; t: number } | null>(null);
  const lostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [labelSeen, setLabelSeen] = useState(false);

  const photoOutput = usePhotoOutput();
  const barcodeScanner = useBarcodeScanner({
    barcodeFormats: ["ean-13", "ean-8", "upc-a", "upc-e"],
  });
  const { scanText } = useTextRecognition({ language: "latin" });

  // Walmart-style reticle: white corner brackets rest at screen center, morph
  // out to hug a detected barcode (yellow, with a hold-progress ring) or a
  // detected nutrition label (white, no ring — the shutter does the rest).
  const { width: winW, height: winH } = useWindowDimensions();
  const rest = { x: winW * 0.19, y: winH * 0.36, w: winW * 0.62, h: 150 };
  const boxX = useSharedValue(rest.x);
  const boxY = useSharedValue(rest.y);
  const boxW = useSharedValue(rest.w);
  const boxH = useSharedValue(rest.h);
  const active = useSharedValue(0);
  const progress = useSharedValue(0);
  const labelMode = useSharedValue(0); // 0 = barcode (yellow + ring), 1 = label (white)

  function resetReticle() {
    cancelAnimation(progress);
    progress.value = 0;
    active.value = withTiming(0, { duration: 120 });
    boxX.value = withTiming(rest.x, { duration: 160 });
    boxY.value = withTiming(rest.y, { duration: 160 });
    boxW.value = withTiming(rest.w, { duration: 160 });
    boxH.value = withTiming(rest.h, { duration: 160 });
  }

  // Reset the one-shot barcode guard whenever the camera reopens.
  if (open && firedBarcode.current && !busy) {
    firedBarcode.current = false;
    seenAt.current = null;
    resetReticle();
  }

  // JS-side handler for detections reported by the frame worklet. Converts
  // camera-sensor coords to view coords and drives the reticle.
  function onDetect(d: Detection) {
    if (firedBarcode.current || busy || capturing) return;
    const preview = camRef.current?.preview;
    if (!preview) return;
    let box: { x: number; y: number; w: number; h: number };
    try {
      const tl = preview.convertCameraPointToViewPoint(d.tl);
      const br = preview.convertCameraPointToViewPoint(d.br);
      // min/max both corners — the camera→view transform may rotate the rect
      box = {
        x: Math.min(tl.x, br.x),
        y: Math.min(tl.y, br.y),
        w: Math.abs(br.x - tl.x),
        h: Math.abs(br.y - tl.y),
      };
    } catch {
      return; // preview not laid out yet
    }
    boxX.value = withTiming(box.x - PAD, { duration: 110 });
    boxY.value = withTiming(box.y - PAD, { duration: 110 });
    boxW.value = withTiming(box.w + PAD * 2, { duration: 110 });
    boxH.value = withTiming(box.h + PAD * 2, { duration: 110 });
    active.value = withTiming(1, { duration: 100 });
    labelMode.value = withTiming(d.kind === "label" ? 1 : 0, { duration: 130 });
    setLabelSeen(d.kind === "label");
    // No "lost" event exists — silence for LOST_MS means it left the frame.
    if (lostTimer.current) clearTimeout(lostTimer.current);
    lostTimer.current = setTimeout(() => {
      seenAt.current = null;
      setLabelSeen(false);
      resetReticle();
    }, LOST_MS);

    if (d.kind === "label") {
      // A label never auto-fires; drop any barcode hold in progress.
      seenAt.current = null;
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }
    const now = Date.now();
    if (!seenAt.current || seenAt.current.code !== d.value) {
      seenAt.current = { code: d.value, t: now };
      cancelAnimation(progress);
      progress.value = 0;
      progress.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear });
    } else if (now - seenAt.current.t >= HOLD_MS) {
      firedBarcode.current = true;
      seenAt.current = null;
      if (lostTimer.current) clearTimeout(lostTimer.current); // keep the reticle locked during lookup
      onBarcode(d.value);
    }
  }

  // MLKit barcode + OCR on the camera's frame thread. The sync calls take
  // ~100-200ms; dropFramesWhileBusy throttles detection to that cadence.
  const frameOutput = useFrameOutput({
    pixelFormat: "rgb", // MLKit OCR needs RGB buffers on Android
    targetResolution: { width: 1280, height: 720 },
    dropFramesWhileBusy: true,
    onFrame(frame) {
      "worklet";
      try {
        const code = barcodeScanner.scanCodes(frame)[0];
        if (code?.rawValue) {
          const b = code.boundingBox;
          scheduleOnRN(onDetect, {
            kind: "barcode" as const,
            value: code.rawValue,
            tl: frame.convertFramePointToCameraPoint({ x: b.left, y: b.top }),
            br: frame.convertFramePointToCameraPoint({ x: b.right, y: b.bottom }),
          });
          return;
        }
        const text = scanText(frame);
        if (text.blocks.length < 4 || !LABEL_WORDS.test(text.resultText)) return;
        let l = Infinity;
        let t = Infinity;
        let r = -Infinity;
        let btm = -Infinity;
        for (const blk of text.blocks) {
          const f = blk.blockFrame;
          if (f.x < l) l = f.x;
          if (f.y < t) t = f.y;
          if (f.x + f.width > r) r = f.x + f.width;
          if (f.y + f.height > btm) btm = f.y + f.height;
        }
        scheduleOnRN(onDetect, {
          kind: "label" as const,
          value: "",
          tl: frame.convertFramePointToCameraPoint({ x: l, y: t }),
          br: frame.convertFramePointToCameraPoint({ x: r, y: btm }),
        });
      } finally {
        frame.dispose();
      }
    },
  });

  const boxStyle = useAnimatedStyle(() => ({
    left: boxX.value,
    top: boxY.value,
    width: boxW.value,
    height: boxH.value,
  }));
  // Brackets only exist while something is locked — invisible at rest.
  // Yellow for barcodes (auto-fires), white for nutrition labels (snap it).
  const cornerColor = useAnimatedStyle(() => ({
    borderColor: interpolateColor(labelMode.value, [0, 1], ["#facc15", "#ffffff"]),
    opacity: active.value,
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: active.value * (1 - labelMode.value), // hold ring is barcode-only
  }));
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_C * (1 - progress.value),
  }));
  // Dim everything outside the locked box, with a ROUNDED clear window: an SVG
  // scrim rect masked by an animated rounded-rect hole that tracks the box.
  const dimOpacity = useAnimatedStyle(() => ({ opacity: active.value }));
  const holeProps = useAnimatedProps(() => ({
    x: boxX.value,
    y: boxY.value,
    width: boxW.value,
    height: boxH.value,
  }));

  async function snap() {
    if (capturing || busy) return;
    setCapturing(true);
    try {
      const pic = await photoOutput.capturePhotoToFile({}, {});
      if (pic?.filePath) {
        onPhoto(pic.filePath.startsWith("file://") ? pic.filePath : `file://${pic.filePath}`);
      }
    } catch {
      // Capture failed (e.g. no camera on the simulator) — stay open, no crash.
    } finally {
      setCapturing(false);
    }
  }

  const corner = (pos: "tl" | "tr" | "bl" | "br") => (
    <Animated.View
      key={pos}
      style={[
        {
          position: "absolute",
          width: CORNER,
          height: CORNER,
          ...(pos === "tl" && {
            top: 0,
            left: 0,
            borderTopWidth: STROKE,
            borderLeftWidth: STROKE,
            borderTopLeftRadius: 10,
          }),
          ...(pos === "tr" && {
            top: 0,
            right: 0,
            borderTopWidth: STROKE,
            borderRightWidth: STROKE,
            borderTopRightRadius: 10,
          }),
          ...(pos === "bl" && {
            bottom: 0,
            left: 0,
            borderBottomWidth: STROKE,
            borderLeftWidth: STROKE,
            borderBottomLeftRadius: 10,
          }),
          ...(pos === "br" && {
            bottom: 0,
            right: 0,
            borderBottomWidth: STROKE,
            borderRightWidth: STROKE,
            borderBottomRightRadius: 10,
          }),
        },
        cornerColor,
      ]}
    />
  );

  // Rendered inline (the /add route is already a fullscreen modal) — a nested
  // RN Modal here left a black sheet visibly dismissing after the camera closed.
  if (!open) return null;
  return (
    <View className="flex-1 bg-black">
        {hasPermission ? (
          <Camera
            ref={camRef}
            style={{ flex: 1 }}
            device="back"
            isActive={open}
            outputs={[photoOutput, frameOutput]}
            onError={() => {
              // e.g. no camera on the simulator — the black screen + hint stay up
            }}
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
              onPress={() => (canRequestPermission ? requestPermission() : Linking.openSettings())}
            >
              <Text className="font-bold text-black">
                {canRequestPermission ? "Grant access" : "Open Settings"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Dim outside the locked box, with a rounded clear window */}
        {hasPermission ? (
          <Animated.View
            pointerEvents="none"
            style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, dimOpacity]}
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
        ) : null}

        {/* Scan reticle: corner brackets + hold-progress ring (barcode only) */}
        {hasPermission ? (
          <Animated.View pointerEvents="none" style={[{ position: "absolute" }, boxStyle]}>
            {corner("tl")}
            {corner("tr")}
            {corner("bl")}
            {corner("br")}
            <Animated.View
              style={[
                {
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  marginTop: -20,
                  marginLeft: -20,
                },
                ringStyle,
              ]}
            >
              <Svg width={40} height={40} style={{ transform: [{ rotate: "-90deg" }] }}>
                <Circle
                  cx={20}
                  cy={20}
                  r={RING_R}
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth={STROKE}
                  fill="none"
                />
                <AnimatedCircle
                  cx={20}
                  cy={20}
                  r={RING_R}
                  stroke="rgba(17,24,39,0.85)"
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${RING_C}`}
                  fill="none"
                  animatedProps={ringProps}
                />
              </Svg>
            </Animated.View>
          </Animated.View>
        ) : null}

        {/* Hint */}
        <View className="absolute inset-x-0 top-16 items-center" pointerEvents="none">
          <Text className="overflow-hidden rounded-full bg-black/55 px-4 py-2 text-sm font-semibold text-white">
            {busy
              ? "Looking up barcode…"
              : labelSeen
                ? "Nutrition label — snap it"
                : "Snap food or a label — or point at a barcode"}
          </Text>
        </View>

        {/* Shutter + library */}
        {hasPermission ? (
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

        {/* Spinner only while a photo is being captured — barcode lookup shows the
            locked reticle + "Looking up…" hint instead of a spinner. */}
        {capturing ? (
          <View className="absolute inset-0 items-center justify-center bg-black/30" pointerEvents="none">
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : null}
    </View>
  );
}
