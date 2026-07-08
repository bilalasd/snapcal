"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Theme = "light" | "dark" | "system";

declare global {
  interface Window {
    __snapcalApplyTheme?: () => void;
  }
}

export function ThemeCard() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    // localStorage is client-only, so read the saved choice after mount
    const saved = localStorage.getItem("snapcal-theme") as Theme | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setTheme(saved);
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    localStorage.setItem("snapcal-theme", next);
    window.__snapcalApplyTheme?.();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SunMoon className="size-4" />
          Appearance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          variant="outline"
          value={[theme]}
          onValueChange={(v: string[]) => v[0] && choose(v[0] as Theme)}
          className="w-full"
        >
          <ToggleGroupItem value="light" className="flex-1">
            <Sun className="size-4" />
            Light
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" className="flex-1">
            <Moon className="size-4" />
            Dark
          </ToggleGroupItem>
          <ToggleGroupItem value="system" className="flex-1">
            <SunMoon className="size-4" />
            Auto
          </ToggleGroupItem>
        </ToggleGroup>
      </CardContent>
    </Card>
  );
}
