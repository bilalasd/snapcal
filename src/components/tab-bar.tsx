"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, Home, Plus, Settings, TrendingUp } from "lucide-react";
import { addMealHref } from "@/lib/nav";
import { cn } from "@/lib/utils";

// Each tab lights up in its own screen's color-block hue when active.
const leftTabs = [
  { href: "/", label: "Today", icon: Home, block: "bg-block-lime" },
  { href: "/history", label: "History", icon: CalendarDays, block: "bg-block-lilac" },
];
const rightTabs = [
  { href: "/weight", label: "Weight", icon: TrendingUp, block: "bg-block-coral" },
  { href: "/settings", label: "Settings", icon: Settings, block: "bg-block-mint" },
];

function Tab({
  href,
  label,
  icon: Icon,
  block,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  block: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] transition-colors",
        active ? `${block} text-black` : "text-muted-foreground",
      )}
    >
      <Icon className="size-[21px]" strokeWidth={active ? 2.4 : 1.8} />
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
            className="bg-magenta -mt-8 flex size-16 items-center justify-center rounded-full text-white ring-4 ring-background transition-transform active:scale-95"
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
