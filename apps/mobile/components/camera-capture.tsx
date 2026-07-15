import { useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
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
const LOST_MS = 500; // no scan events for this long = barcode left the frame
const PAD = 22; // breathing room between barcode bounds and brackets
const HOLE_R = 18; // corner radius of the clear (non-dimmed) window
const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;
const CORNER = 30;
const STROKE = 5;

// One camera for all three: the shutter captures food or a nutrition label
// (→ AI analyze, which reads both), and a barcode in frame is auto-detected
// (→ Open Food Facts lookup). `busy` covers the barcode lookup in progress.
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
  const [permission, requestPermission] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);
  const firedBarcode = useRef(false);
  const seenAt = useRef<{ code: string; t: number } | null>(null);
  const lostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [capturing, setCapturing] = useState(false);

  // Walmart-style reticle: white corner brackets rest at screen center, morph
  // out to hug a detected barcode and turn yellow; a center ring fills over
  // HOLD_MS to show how long to keep holding.
  const { width: winW, height: winH } = useWindowDimensions();
  const rest = { x: winW * 0.19, y: winH * 0.36, w: winW * 0.62, h: 150 };
  const boxX = useSharedValue(rest.x);
  const boxY = useSharedValue(rest.y);
  const boxW = useSharedValue(rest.w);
  const boxH = useSharedValue(rest.h);
  const active = useSharedValue(0);
  const progress = useSharedValue(0);

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

  const boxStyle = useAnimatedStyle(() => ({
    left: boxX.value,
    top: boxY.value,
    width: boxW.value,
    height: boxH.value,
  }));
  // Brackets only exist while a barcode is locked — invisible at rest.
  const cornerColor = useAnimatedStyle(() => ({
    borderColor: "#facc15",
    opacity: active.value,
  }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: active.value }));
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
    if (capturing || busy || !camRef.current) return;
    setCapturing(true);
    try {
      const pic = await camRef.current.takePictureAsync({ quality: 1 });
      if (pic?.uri) onPhoto(pic.uri);
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

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        {permission?.granted ? (
          <CameraView
            ref={camRef}
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
            onBarcodeScanned={({ data, bounds }) => {
              if (firedBarcode.current || busy || capturing) return;
              // ponytail: bounds are view coords on iOS; Android can report 0-size — brackets stay at rest then
              if (bounds?.size.width) {
                boxX.value = withTiming(bounds.origin.x - PAD, { duration: 110 });
                boxY.value = withTiming(bounds.origin.y - PAD, { duration: 110 });
                boxW.value = withTiming(bounds.size.width + PAD * 2, { duration: 110 });
                boxH.value = withTiming(bounds.size.height + PAD * 2, { duration: 110 });
              }
              active.value = withTiming(1, { duration: 100 });
              // No "barcode lost" event exists — silence for LOST_MS means it left the frame.
              if (lostTimer.current) clearTimeout(lostTimer.current);
              lostTimer.current = setTimeout(() => {
                seenAt.current = null;
                resetReticle();
              }, LOST_MS);
              const now = Date.now();
              if (!seenAt.current || seenAt.current.code !== data) {
                seenAt.current = { code: data, t: now };
                cancelAnimation(progress);
                progress.value = 0;
                progress.value = withTiming(1, {
                  duration: HOLD_MS,
                  easing: Easing.linear,
                });
              } else if (now - seenAt.current.t >= HOLD_MS) {
                firedBarcode.current = true;
                seenAt.current = null;
                if (lostTimer.current) clearTimeout(lostTimer.current); // keep the reticle locked during lookup
                onBarcode(data);
              }
            }}
          />
        ) : (
          <View className="flex-1 items-center justify-center gap-4 px-8">
            <Feather name="camera-off" size={40} color="#fff" />
            <Text className="text-center text-base text-white">
              Camera access is needed to log meals.
            </Text>
            <Pressable className="rounded-2xl bg-white px-5 py-3" onPress={requestPermission}>
              <Text className="font-bold text-black">Grant access</Text>
            </Pressable>
          </View>
        )}

        {/* Dim outside the locked barcode, with a rounded clear window */}
        {permission?.granted ? (
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

        {/* Scan reticle: corner brackets + hold-progress ring */}
        {permission?.granted ? (
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
            {busy ? "Looking up barcode…" : "Snap food or a label — or point at a barcode"}
          </Text>
        </View>

        {/* Shutter + library */}
        {permission?.granted ? (
          <View className="absolute inset-x-0 bottom-12 items-center justify-center">
            <Pressable
              onPress={snap}
              disabled={capturing || busy}
              className="h-20 w-20 items-center justify-center rounded-full border-4 border-white active:opacity-70"
            >
              <View className="h-16 w-16 rounded-full bg-white" />
            </Pressable>
            {onLibrary ? (
              <Pressable
                onPress={onLibrary}
                disabled={capturing || busy}
                className="absolute left-8 h-12 w-12 items-center justify-center rounded-full bg-black/50 active:opacity-70"
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
          className="absolute right-5 top-14 h-11 w-11 items-center justify-center rounded-full bg-black/50"
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
    </Modal>
  );
}
