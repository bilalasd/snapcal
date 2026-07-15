import { useRef, useState } from "react";
import { Modal, View, Text, Pressable, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Feather } from "@expo/vector-icons";

// One camera for all three: the shutter captures food or a nutrition label
// (→ AI analyze, which reads both), and a barcode in frame is auto-detected
// (→ Open Food Facts lookup). `busy` covers the barcode lookup in progress.
export function CameraCapture({
  open,
  onClose,
  onPhoto,
  onBarcode,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onPhoto: (uri: string) => void;
  onBarcode: (code: string) => void;
  busy?: boolean;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);
  const firedBarcode = useRef(false);
  const [capturing, setCapturing] = useState(false);
  const [barcodeBox, setBarcodeBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Reset the one-shot barcode guard whenever the camera reopens.
  if (open && firedBarcode.current && !busy) {
    firedBarcode.current = false;
    if (barcodeBox) setBarcodeBox(null);
  }

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
              firedBarcode.current = true;
              // ponytail: bounds are view coords on iOS; Android can report 0-size — just skip the box then
              if (bounds?.size.width) {
                setBarcodeBox({ ...bounds.origin, ...bounds.size });
              }
              onBarcode(data);
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

        {/* Barcode highlight */}
        {barcodeBox ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: barcodeBox.x,
              top: barcodeBox.y,
              width: barcodeBox.width,
              height: barcodeBox.height,
              borderWidth: 3,
              borderColor: "#22c55e",
              borderRadius: 8,
            }}
          />
        ) : null}

        {/* Hint */}
        <View className="absolute inset-x-0 top-16 items-center" pointerEvents="none">
          <Text className="overflow-hidden rounded-full bg-black/55 px-4 py-2 text-sm font-semibold text-white">
            {busy ? "Looking up barcode…" : "Snap food or a label — or point at a barcode"}
          </Text>
        </View>

        {/* Shutter */}
        {permission?.granted ? (
          <View className="absolute inset-x-0 bottom-12 items-center">
            <Pressable
              onPress={snap}
              disabled={capturing || busy}
              className="h-20 w-20 items-center justify-center rounded-full border-4 border-white active:opacity-70"
            >
              <View className="h-16 w-16 rounded-full bg-white" />
            </Pressable>
          </View>
        ) : null}

        {/* Close */}
        <Pressable
          onPress={onClose}
          className="absolute right-5 top-14 h-11 w-11 items-center justify-center rounded-full bg-black/50"
        >
          <Feather name="x" size={22} color="#fff" />
        </Pressable>

        {busy || capturing ? (
          <View className="absolute inset-0 items-center justify-center bg-black/30" pointerEvents="none">
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
