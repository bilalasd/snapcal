import { useColorScheme } from "react-native";

// Raw-color mirror of the global.css theme tokens, for props NativeWind
// can't style (vector icon `color`, placeholderTextColor, ActivityIndicator).
// Keep in sync with global.css — single source for hex outside classes.
const light: Record<
  "foreground" | "background" | "muted" | "mutedForeground" | "destructive" | "warning" | "border",
  string
> = {
  foreground: "#000000",
  background: "#ffffff",
  muted: "#f7f7f5",
  mutedForeground: "#565656",
  destructive: "#d92d20",
  warning: "#b45309", // low-confidence guess marks — 5.0:1 on white
  border: "#e6e6e6",
};

const dark: typeof light = {
  foreground: "#f5f5f5",
  background: "#0c0c0c",
  muted: "#1c1c1a",
  mutedForeground: "#a3a3a3",
  destructive: "#f97066",
  warning: "#d97706", // brighter amber clears 6.0:1 on the dark base
  border: "#2a2a2a",
};

export function useColors() {
  return useColorScheme() === "dark" ? dark : light;
}

// Pastel block tiles — static in both themes (text on them is fixed ink).
// Mirrors tailwind.config.js `block.*`. Used as inline style on Card because
// stacking a second bg-* class on Card's bg-card loses the class conflict.
export const block = {
  lime: "#dceeb1",
  lilac: "#c5b0f4",
  cream: "#f4ecd6",
  mint: "#c8e6cd",
  coral: "#f3c9b6",
} as const;
