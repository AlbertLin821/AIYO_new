"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [retryToken, setRetryToken] = useState(0);
  const resolved = resolvePlacePhotoUrl(src, placeId);
  const displaySrc = useMemo(() => {
    if (!resolved) {
      return undefined;
    }
    if (!retryToken) {
      return resolved;
    }
    try {
      const parsed = resolved.startsWith("http")
        ? new URL(resolved)
        : new URL(resolved, "https://local.invalid");
      parsed.searchParams.set("_imgRetry", String(retryToken));
      if (parsed.origin === "https://local.invalid" && resolved.startsWith("/")) {
        return `${parsed.pathname}${parsed.search}`;
      }
      return parsed.toString();
    } catch {
      const separator = resolved.includes("?") ? "&" : "?";
      return `${resolved}${separator}_imgRetry=${retryToken}`;
    }
  }, [resolved, retryToken]);
  const showImage = Boolean(displaySrc) && failedSrc !== resolved;

  useEffect(() => {
    setFailedSrc(null);
    setRetryToken(0);
  }, [resolved]);

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
          src={displaySrc}
          alt={alt}
          className={cn("size-full object-cover", imageClassName)}
          onError={() => {
            if (resolved && retryToken === 0) {
              setRetryToken(Date.now());
              return;
            }
            setFailedSrc(resolved ?? null);
          }}
        />
      ) : (
        <span className="text-xs text-muted">{placeholder}</span>
      )}
    </div>
  );
}
