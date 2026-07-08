"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, Plus, Settings, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const leftTabs = [
  { href: "/", label: "Today", icon: Home },
  { href: "/history", label: "History", icon: CalendarDays },
];
const rightTabs = [
  { href: "/trends", label: "Trends", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Tab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[11px] transition-colors",
        active ? "text-primary font-semibold" : "text-muted-foreground",
      )}
    >
      <Icon
        className={cn("size-[22px]", active && "drop-shadow-sm")}
        strokeWidth={active ? 2.4 : 1.8}
      />
      {label}
    </Link>
  );
}

export function TabBar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/90 backdrop-blur-lg"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex h-[68px] max-w-md items-stretch px-2">
        {leftTabs.map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(tab.href)} />
        ))}

        <div className="flex flex-1 items-center justify-center">
          <Link
            href="/add"
            aria-label="Log a meal"
            className="bg-primary text-primary-foreground -mt-7 flex size-14 items-center justify-center rounded-full shadow-lg shadow-primary/30 ring-4 ring-background transition-transform active:scale-95"
          >
            <Plus className="size-7" strokeWidth={2.4} />
          </Link>
        </div>

        {rightTabs.map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(tab.href)} />
        ))}
      </div>
    </nav>
  );
}
