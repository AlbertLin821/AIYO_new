"use client";

import { useEffect, useState } from "react";
import { resolvePlacePhotoUrl } from "@/lib/placePhotoUrl";
import { cn } from "@/lib/utils";

type PlaceThumbnailProps = {
  src?: string | null;
  alt: string;
  placeholder: string;
  className?: string;
  imageClassName?: string;
};

export default function PlaceThumbnail({
  src,
  alt,
  placeholder,
  className,
  imageClassName,
}: PlaceThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const resolved = resolvePlacePhotoUrl(src);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImage = Boolean(resolved) && !failed;

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
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-xs text-muted">{placeholder}</span>
      )}
    </div>
  );
}
