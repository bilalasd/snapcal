import { useRef, useState } from "react";
import { Modal, View, Text, Pressable, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Feather } from "@expo/vector-icons";

// Full-screen scanner. Calls onScanned once with the first barcode read, then
// the parent closes it and does the lookup.
export function BarcodeScanner({
  open,
  onClose,
  onScanned,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
  busy?: boolean;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const fired = useRef(false);

  // Reset the one-shot guard each time the scanner opens.
  if (open && fired.current && !busy) fired.current = false;

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
            onBarcodeScanned={({ data }) => {
              if (fired.current || busy) return;
              fired.current = true;
              onScanned(data);
            }}
          />
        ) : (
          <View className="flex-1 items-center justify-center gap-4 px-8">
            <Feather name="camera-off" size={40} color="#fff" />
            <Text className="text-center text-base text-white">
              Camera access is needed to scan barcodes.
            </Text>
            <Pressable className="rounded-2xl bg-white px-5 py-3" onPress={requestPermission}>
              <Text className="font-bold text-black">Grant access</Text>
            </Pressable>
          </View>
        )}

        {/* Aiming frame + hint */}
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <View className="h-40 w-72 rounded-2xl border-2 border-white/80" />
          <Text className="mt-4 text-sm font-semibold text-white/90">
            {busy ? "Looking up…" : "Point at the barcode"}
          </Text>
          {busy ? <ActivityIndicator color="#fff" className="mt-2" /> : null}
        </View>

        <Pressable
          onPress={onClose}
          className="absolute right-5 top-14 h-11 w-11 items-center justify-center rounded-full bg-black/50"
        >
          <Feather name="x" size={22} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}
