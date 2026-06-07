"use client";

import { useState } from "react";
import { resolvePlacePhotoUrl } from "@/lib/placePhotoUrl";
import { cn } from "@/lib/utils";

type PlaceThumbnailProps = {
  src?: string | null;
  placeId?: string | null;
  alt: string;
  placeholder: string;
  className?: string;
  imageClassName?: string;
};

export default function PlaceThumbnail({
  src,
  placeId,
  alt,
  placeholder,
  className,
  imageClassName,
}: PlaceThumbnailProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolved = resolvePlacePhotoUrl(src, placeId);
  const showImage = Boolean(resolved) && failedSrc !== resolved;

  return (
    <div
      className={cn(
        "relative flex h-[132px] items-center justify-center overflow-hidden bg-[#eef3f7]",
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved}
          alt={alt}
          className={cn("size-full object-cover", imageClassName)}
          onError={() => setFailedSrc(resolved ?? null)}
        />
      ) : (
        <span className="text-xs text-muted">{placeholder}</span>
      )}
    </div>
  );
}
