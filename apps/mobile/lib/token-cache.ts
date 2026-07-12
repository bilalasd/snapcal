import * as SecureStore from "expo-secure-store";

// Clerk stores its session JWT here so it survives app restarts.
export const tokenCache = {
  getToken: (key: string) => SecureStore.getItemAsync(key),
  saveToken: (key: string, value: string) => SecureStore.setItemAsync(key, value),
};
