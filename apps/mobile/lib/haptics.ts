import * as Haptics from "expo-haptics";

// Thin wrappers so call sites read intent, not the enum.
export const tapSuccess = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
export const tapLight = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
