"use client";

import Image from "next/image";

/** Read-only row of meal photo thumbnails (used in review + edit). */
export function PhotoStrip({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto">
      {urls.map((url, i) => (
        <Image
          key={url}
          src={url}
          alt={`Meal photo ${i + 1}`}
          width={88}
          height={88}
          unoptimized
          className="size-[88px] shrink-0 rounded-lg object-cover"
        />
      ))}
    </div>
  );
}
