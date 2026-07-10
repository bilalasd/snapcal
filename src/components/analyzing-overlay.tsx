"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { UtensilsCrossed } from "lucide-react";

const STATUS_LINES = [
  "Identifying foods",
  "Estimating portions",
  "Checking the database",
  "Adding up the macros",
];

/**
 * Full-screen "the AI is working" state shown while a meal is being analyzed.
 * Deliberately unmissable: covers the screen, shows the user's own photo with a
 * sweeping scan line, and rotates through status lines so it never looks frozen.
 */
export function AnalyzingOverlay({ photoUrl }: { photoUrl?: string }) {
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const id = setInterval(
      () => setStep((s) => (s + 1) % STATUS_LINES.length),
      1400,
    );
    return () => clearInterval(id);
  }, []);

  // Portal to <body> so no ancestor stacking context can trap the fixed
  // overlay beneath the sticky header or tab-bar — it must cover everything.
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background/95 px-8 backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-label="Analyzing your meal"
    >
      <div className="editorial-cut relative size-56 overflow-hidden bg-muted ring-1 ring-foreground/15">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt=""
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-primary-strong">
            <UtensilsCrossed className="size-16" strokeWidth={1.6} />
          </div>
        )}
        {/* Sweeping scan line + faint tint over the photo */}
        <div className="scan-sweep pointer-events-none absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-primary/25 to-transparent" />
        <div className="scan-line pointer-events-none absolute inset-x-0 h-0.5 bg-primary shadow-[0_0_16px_2px_var(--primary)]" />
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-2xl font-black tracking-[-0.05em]">
          Reading your plate…
        </p>
        <p className="editorial-kicker flex items-center gap-2 text-primary-strong">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          {STATUS_LINES[step]}
        </p>
      </div>

      <style>{`
        @keyframes scan-line-move { 0% { top: 4%; } 100% { top: 96%; } }
        @keyframes scan-sweep-move { 0% { top: -33%; } 100% { top: 100%; } }
        .scan-line { animation: scan-line-move 1.8s ease-in-out infinite alternate; }
        .scan-sweep { animation: scan-sweep-move 1.8s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) {
          .scan-line, .scan-sweep { animation: none; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
