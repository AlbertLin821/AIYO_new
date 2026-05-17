"use client";

import type { ChatBackgroundPreset } from "@/lib/chatBackground";
import { cn } from "@/lib/utils";

type Props = {
  preset: ChatBackgroundPreset;
};

export default function ChatScenicBackground({ preset }: Props) {
  const fallback = preset.imageFallback;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      {preset.imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preset.imageSrc}
          alt=""
          className="h-full w-full scale-105 object-cover"
          onError={(event) => {
            if (!fallback) {
              return;
            }
            const target = event.currentTarget;
            if (target.src.includes(fallback)) {
              return;
            }
            target.src = fallback;
          }}
        />
      ) : null}
      <div className={cn("absolute inset-0", preset.baseClass)} />
      {preset.overlayClass ? <div className={cn("absolute inset-0", preset.overlayClass)} /> : null}
      {preset.theme === "dark" ? <div className="absolute inset-0 bg-black/15" /> : null}
    </div>
  );
}
