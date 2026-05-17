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
      {/* 底層色塊：圖載入前占位；有圖片時由下層透出，不把照片整張蓋掉 */}
      <div className={cn("absolute inset-0", preset.baseClass)} />
      {preset.imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preset.imageSrc}
          alt=""
          className="absolute inset-0 size-full scale-105 object-cover"
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
      {preset.overlayClass ? <div className={cn("absolute inset-0", preset.overlayClass)} /> : null}
      {preset.theme === "dark" ? <div className="absolute inset-0 bg-black/15" /> : null}
    </div>
  );
}
