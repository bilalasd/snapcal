"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, Home, Plus, Settings, TrendingUp } from "lucide-react";
import { addMealHref } from "@/lib/nav";
import { cn } from "@/lib/utils";

const leftTabs = [
  { href: "/", label: "Today", icon: Home },
  { href: "/history", label: "History", icon: CalendarDays },
];
const rightTabs = [
  { href: "/weight", label: "Weight", icon: TrendingUp },
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
        "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-sm py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
      )}
    >
      <Icon
        className={cn("size-[21px]", active && "drop-shadow-sm")}
        strokeWidth={active ? 2.4 : 1.8}
      />
      {label}
    </Link>
  );
}

export function TabBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const addHref = addMealHref(pathname, searchParams.get("date"));
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-foreground/15 bg-card/92 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex h-[72px] max-w-md items-stretch gap-1 px-2 pt-2">
        {leftTabs.map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(tab.href)} />
        ))}

        <div className="flex flex-1 items-center justify-center">
          <Link
            href={addHref}
            aria-label="Log a meal"
            className="-mt-8 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background transition-transform active:scale-95"
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
