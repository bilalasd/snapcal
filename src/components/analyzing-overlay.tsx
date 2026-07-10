"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Check, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  "Identifying foods",
  "Estimating portions",
  "Checking the database",
  "Adding up the macros",
];

/**
 * Full-screen "the AI is working" state. Unmissable and alive: the photo sits in
 * a rounded frame with a rotating scanner ring and a sweeping beam over a pulsing
 * lime glow, while a checklist ticks through the steps so progress reads clearly.
 */
export function AnalyzingOverlay({ photoUrl }: { photoUrl?: string }) {
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Cycle through the steps then a fully-checked beat, then loop.
    const id = setInterval(() => setStep((s) => (s + 1) % (STEPS.length + 1)), 1100);
    return () => clearInterval(id);
  }, []);

  // Portal to <body> so no ancestor stacking context traps the fixed overlay.
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-9 bg-background/96 px-8 backdrop-blur-xl"
      role="status"
      aria-live="polite"
      aria-label="Analyzing your meal"
    >
      <div className="relative grid place-items-center">
        <div className="scanner-glow bg-block-lime absolute size-64 rounded-full blur-3xl" />
        <div className="scanner-ring absolute size-[15rem] rounded-[2.25rem]" />
        <div className="bg-block-lime relative size-52 overflow-hidden rounded-[2rem]">
          {photoUrl ? (
            <Image src={photoUrl} alt="" fill unoptimized className="object-cover" />
          ) : (
            <div className="grid size-full place-items-center text-black">
              <UtensilsCrossed className="size-16" strokeWidth={1.6} />
            </div>
          )}
          <div className="scan-beam pointer-events-none absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-black/20 to-transparent" />
          <div className="scan-line pointer-events-none absolute inset-x-0 h-0.5 bg-black/70" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-5">
        <p className="text-2xl font-semibold tracking-[-0.03em]">
          Reading your plate…
        </p>
        <ul className="flex flex-col gap-2.5">
          {STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-2.5 font-mono text-[0.72rem] tracking-[0.06em] uppercase transition-opacity duration-300",
                  active
                    ? "text-foreground opacity-100"
                    : done
                      ? "text-foreground opacity-55"
                      : "text-muted-foreground opacity-40",
                )}
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                    done
                      ? "bg-foreground text-background border-transparent"
                      : active
                        ? "border-foreground"
                        : "border-muted-foreground",
                  )}
                >
                  {done ? (
                    <Check className="size-2.5" strokeWidth={3} />
                  ) : active ? (
                    <span className="bg-foreground size-1.5 animate-pulse rounded-full" />
                  ) : null}
                </span>
                {label}
              </li>
            );
          })}
        </ul>
      </div>

      <style>{`
        @keyframes scanner-ring-spin { to { transform: rotate(360deg); } }
        @keyframes scan-line-move { 0%, 100% { top: 6%; } 50% { top: 92%; } }
        @keyframes scan-beam-move { 0%, 100% { top: -28%; } 50% { top: 86%; } }
        @keyframes glow-pulse { 0%, 100% { opacity: 0.45; transform: scale(0.95); } 50% { opacity: 0.85; transform: scale(1.05); } }
        .scanner-ring {
          background: conic-gradient(from 0deg, transparent 210deg, var(--foreground) 320deg, transparent 360deg);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
          animation: scanner-ring-spin 1.5s linear infinite;
        }
        .scanner-glow { animation: glow-pulse 2.4s ease-in-out infinite; }
        .scan-line { animation: scan-line-move 2.1s ease-in-out infinite; }
        .scan-beam { animation: scan-beam-move 2.1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .scanner-ring, .scanner-glow, .scan-line, .scan-beam { animation: none; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
