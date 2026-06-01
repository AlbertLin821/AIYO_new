"use client";

import Image from "next/image";
import { ExternalLink, MapPin, PlayCircle } from "lucide-react";
import type { SourceReference } from "@/lib/types/sources";
import { cn } from "@/lib/utils";
import { buildYoutubeWatchUrl, formatSecondsAsClock } from "@/lib/youtubeWatchUrl";

function timestampRange(source: SourceReference): string | null {
  const yt = source.youtube;
  if (!yt) {
    return null;
  }
  if (yt.timestampLabel) {
    return yt.timestampLabel;
  }
  if (yt.startSeconds != null && yt.endSeconds != null) {
    return `${formatSecondsAsClock(yt.startSeconds)} – ${formatSecondsAsClock(yt.endSeconds)}`;
  }
  if (yt.startSeconds != null) {
    return `${formatSecondsAsClock(yt.startSeconds)} 起`;
  }
  return null;
}

export function YouTubeSourceCard({ source }: { source: SourceReference }) {
  const yt = source.youtube;
  const range = timestampRange(source);
  const href =
    yt?.videoId &&
    buildYoutubeWatchUrl(
      yt.videoId,
      typeof yt.startSeconds === "number" ? Math.floor(yt.startSeconds) : undefined,
    );

  const hints = (yt?.locationHints ?? []).filter(Boolean);
  const segmentTitle = yt?.segmentTitle?.trim();

  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl border border-border-light bg-cream/50 p-4 shadow-sm",
      )}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <PlayCircle className="size-4 text-red-600" aria-hidden />
        YouTube
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {source.thumbnailUrl ? (
          <Image
            src={source.thumbnailUrl}
            alt=""
            width={160}
            height={100}
            unoptimized
            className="h-24 w-full rounded-lg object-cover sm:h-20 sm:w-36"
          />
        ) : (
          <div className="flex h-24 w-full items-center justify-center rounded-lg bg-muted/60 text-xs text-muted sm:h-20 sm:w-36">
            無縮圖
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-foreground">{source.title}</p>
          {segmentTitle ? <p className="text-xs font-medium text-foreground/80">段落：{segmentTitle}</p> : null}
          {yt?.channelTitle ? <p className="text-xs text-muted">{yt.channelTitle}</p> : null}
          {range ? (
            <p className="text-xs font-medium text-foreground/90">
              <span className="text-muted">時間</span> · {range}
            </p>
          ) : null}
          {hints.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {hints.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                >
                  <MapPin className="size-3 shrink-0 opacity-80" aria-hidden />
                  {name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {source.youtube?.transcriptText ? (
        <p className="rounded-xl border border-border-light/80 bg-background/80 px-3 py-2 text-xs leading-relaxed text-foreground/90">
          {source.youtube.transcriptText}
        </p>
      ) : (
        <p className="text-xs text-muted">此來源未附字幕片段（或尚不可用）。</p>
      )}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          以時間戳開啟 YouTube
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}
