import { forwardRef } from "react";
import {
  Pressable,
  Text,
  View,
  TextInput,
  ActivityIndicator,
  type PressableProps,
  type TextInputProps,
  type ViewProps,
} from "react-native";

// Lean NativeWind primitives — the RN stand-ins for the web shadcn set. Only
// what the screens actually use; grow as needed.
// ponytail: one file instead of 22 shadcn files.

type ButtonVariant = "default" | "outline" | "ghost";
type ButtonSize = "default" | "sm" | "icon";

const BTN_BASE = "flex-row items-center justify-center gap-2 rounded-2xl active:opacity-80";
const BTN_VARIANT: Record<ButtonVariant, string> = {
  default: "bg-primary",
  outline: "border border-border bg-background",
  ghost: "",
};
const BTN_SIZE: Record<ButtonSize, string> = {
  default: "px-5 py-4",
  sm: "px-3 py-2",
  icon: "h-12 w-12",
};
const BTN_TEXT: Record<ButtonVariant, string> = {
  default: "text-white",
  outline: "text-foreground",
  ghost: "text-foreground",
};

export function Button({
  children,
  variant = "default",
  size = "default",
  className = "",
  textClassName = "",
  disabled,
  ...props
}: PressableProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  textClassName?: string;
}) {
  return (
    <Pressable
      className={`${BTN_BASE} ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${disabled ? "opacity-40" : ""} ${className}`}
      disabled={disabled}
      {...props}
    >
      {typeof children === "string" ? (
        <Text className={`text-base font-bold ${BTN_TEXT[variant]} ${textClassName}`}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function Card({ className = "", ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={`rounded-3xl border border-border bg-card ${className}`}
      {...props}
    />
  );
}

export function Badge({
  children,
  className = "",
  textClassName = "",
}: {
  children: React.ReactNode;
  className?: string;
  textClassName?: string;
}) {
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${className}`}>
      {typeof children === "string" ? (
        <Text className={`text-xs font-bold uppercase ${textClassName}`}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <View className={`bg-muted ${className}`} />;
}

export function Kicker({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <Text className={`text-muted-foreground text-xs font-extrabold uppercase tracking-[2px] ${className}`}>
      {children}
    </Text>
  );
}

export function Headline({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <Text className={`text-4xl font-black tracking-tighter text-foreground ${className}`}>
      {children}
    </Text>
  );
}

export const Input = forwardRef<TextInput, TextInputProps & { className?: string }>(
  ({ className = "", ...props }, ref) => (
    <TextInput
      ref={ref}
      placeholderTextColor="#565656"
      className={`rounded-2xl border border-border bg-muted px-4 py-3 text-base text-foreground ${className}`}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Kicker>{label}</Kicker>
      {children}
    </View>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <ActivityIndicator color="#000000" className={className} />;
}
