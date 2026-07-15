import { useColorScheme } from "react-native";

// Raw-color mirror of the global.css theme tokens, for props NativeWind
// can't style (vector icon `color`, placeholderTextColor, ActivityIndicator).
// Keep in sync with global.css — single source for hex outside classes.
const light: Record<"foreground" | "background" | "mutedForeground" | "destructive" | "border", string> = {
  foreground: "#000000",
  background: "#ffffff",
  mutedForeground: "#565656",
  destructive: "#d92d20",
  border: "#e6e6e6",
};

const dark: typeof light = {
  foreground: "#f5f5f5",
  background: "#0c0c0c",
  mutedForeground: "#a3a3a3",
  destructive: "#f97066",
  border: "#2a2a2a",
};

export function useColors() {
  return useColorScheme() === "dark" ? dark : light;
}
