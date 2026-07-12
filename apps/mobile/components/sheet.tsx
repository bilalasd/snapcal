import { Modal, Pressable, View, KeyboardAvoidingView, Platform } from "react-native";

// ponytail: RN Modal + slide-up panel instead of @gorhom/bottom-sheet — no
// provider wiring, and the swipe-to-dismiss polish can come in Phase 5.
export function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="absolute bottom-0 w-full rounded-t-3xl bg-background pb-8 pt-3">
          <View className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-border" />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
