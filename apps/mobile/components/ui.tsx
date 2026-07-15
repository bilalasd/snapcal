import { forwardRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
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
import { useColors } from "../lib/colors";

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
  ...props
}: ViewProps & {
  children: React.ReactNode;
  className?: string;
  textClassName?: string;
}) {
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${className}`} {...props}>
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
      placeholderTextColor={useColors().mutedForeground}
      className={`rounded-2xl border border-border bg-muted px-4 py-3 text-base text-foreground ${className}`}
      {...props}
    />
  ),
);
Input.displayName = "Input";

/** Input with a show/hide toggle — the standard password field. */
export function PasswordInput({ className = "", ...props }: TextInputProps & { className?: string }) {
  const [show, setShow] = useState(false);
  const colors = useColors();
  return (
    <View>
      <Input secureTextEntry={!show} className={`pr-12 ${className}`} {...props} />
      <Pressable
        onPress={() => setShow(!show)}
        accessibilityRole="button"
        accessibilityLabel={show ? "Hide password" : "Show password"}
        className="absolute bottom-0 right-0 top-0 w-12 items-center justify-center"
      >
        <Feather name={show ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

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

export function Spinner({ className, color }: { className?: string; color?: string }) {
  const colors = useColors();
  return <ActivityIndicator color={color ?? colors.foreground} className={className} />;
}

export function Alert({
  icon,
  title,
  children,
  variant = "default",
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  children?: React.ReactNode;
  variant?: "default" | "destructive";
}) {
  const colors = useColors();
  const color = variant === "destructive" ? colors.destructive : colors.foreground;
  return (
    <View className={`flex-row gap-3 rounded-2xl border p-4 ${variant === "destructive" ? "border-destructive/30" : "border-border"} bg-card`}>
      <Feather name={icon} size={18} color={color} />
      <View className="flex-1">
        <Text className={`font-bold ${variant === "destructive" ? "text-destructive" : "text-foreground"}`}>{title}</Text>
        {children ? <Text className="mt-0.5 text-sm text-muted-foreground">{children}</Text> : null}
      </View>
    </View>
  );
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row rounded-xl border border-border bg-card p-0.5">
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          hitSlop={{ top: 10, bottom: 10 }}
          accessibilityRole="button"
          accessibilityState={{ selected: value === o.value }}
          className={`rounded-lg px-3 py-1.5 active:opacity-70 ${value === o.value ? "bg-primary" : ""}`}
        >
          <Text className={`text-xs font-bold ${value === o.value ? "text-white" : "text-muted-foreground"}`}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
