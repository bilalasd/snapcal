import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/clerk-expo";

export default function Settings() {
  const { signOut } = useAuth();
  const { user } = useUser();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="p-5">
        <Text className="text-muted-foreground text-xs font-bold uppercase tracking-[3px]">
          Control room
        </Text>
        <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">Settings</Text>

        <View className="mt-8 rounded-2xl bg-muted p-4">
          <Text className="text-xs font-bold uppercase tracking-[2px] text-muted-foreground">
            Signed in as
          </Text>
          <Text className="mt-1 text-base text-foreground">
            {user?.primaryEmailAddress?.emailAddress ?? "—"}
          </Text>
        </View>

        <Pressable
          className="mt-4 rounded-2xl border border-border py-4 active:opacity-70"
          onPress={() => signOut()}
        >
          <Text className="text-center text-base font-bold text-destructive">Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
