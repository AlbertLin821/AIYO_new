"use client";

import { memo, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { m } from "@/lib/motion";
import { AlertCircle, Clock, ExternalLink, Loader2, Play, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Video } from "@/types";
import type { VideoSummaryStatus } from "@/stores/useVideoStore";
import { zhTW as t } from "@/locales/zh-TW";

interface VideoCardProps {
  video: Video;
  index: number;
  onClick: () => void;
  onDismiss?: () => void;
  processingState?: VideoSummaryStatus | null;
}

const gradients = [
  "from-primary/20 via-lavender/20 to-secondary/20",
  "from-secondary/20 via-peach/20 to-tertiary/20",
  "from-tertiary/20 via-primary/20 to-lavender/20",
  "from-lavender/20 via-secondary/20 to-peach/20",
  "from-peach/20 via-tertiary/20 to-primary/20",
  "from-primary/20 via-peach/20 to-secondary/20",
];

function sourceLabel(source: string) {
  if (source === "youtube-data-api") {
    return t.videoCard.sourceYoutube;
  }
  if (source === "default-recommendation") {
    return t.home.sourceDefault;
  }
  if (source === "mock-fallback") {
    return t.home.sourceFallback;
  }
  return source;
}

function VideoCard({ video, index, onClick, onDismiss, processingState = null }: VideoCardProps) {
  const thumbLabels = t.videoCard.thumbLabels;
  const [imageFailed, setImageFailed] = useState(false);
  const showThumbnail = Boolean(video.thumbnail) && !imageFailed;
  const isProcessing = processingState === "queued" || processingState === "running";
  function handleActivate() {
    onClick();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
    >
      <Card
        role="button"
        tabIndex={0}
        aria-label={`${t.videoCard.openVideoSummary}：${video.title}`}
        data-testid="video-card"
        onClick={handleActivate}
        onKeyDown={handleKeyDown}
        className="group cursor-pointer overflow-hidden rounded-2xl border-0 bg-surface py-0 shadow-soft ring-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-soft-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
      <div
        className={`relative aspect-video bg-gradient-to-br ${gradients[index % gradients.length]} flex items-center justify-center`}
      >
        {showThumbnail ? (
          <Image
            src={video.thumbnail}
            alt={video.title}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-foreground/60">
            <AlertCircle className="size-6" />
            <span className="px-4 text-center text-xs font-medium">{t.videoCard.thumbUnavailable}</span>
            <span className="text-2xl font-bold tracking-[0.3em] text-foreground/45">
              {thumbLabels[index % thumbLabels.length]}
            </span>
          </div>
        )}

        <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-foreground/70 text-white text-xs font-medium rounded-md flex items-center gap-1">
          <Clock className="size-3" />
          {video.duration}
        </div>

        {onDismiss ? (
          <button
            type="button"
            aria-label={t.videoCard.removeVideo}
            title={t.videoCard.removeVideo}
            onClick={(event) => {
              event.stopPropagation();
              onDismiss();
            }}
            className="absolute right-2 top-2 z-10 flex size-7 cursor-pointer items-center justify-center rounded-full bg-foreground/75 text-white opacity-0 shadow-md transition-opacity duration-200 hover:bg-foreground/90 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 group-hover:opacity-100"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}

        {isProcessing ? (
          <>
            <div className="pointer-events-none absolute inset-0 z-[1] bg-foreground/18 transition-all duration-300 group-hover:bg-foreground/24" />
            <div className="pointer-events-none absolute left-2 top-2 z-[2] inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[10px] font-medium text-foreground shadow-sm">
              <Loader2 className="size-3 animate-spin text-primary" aria-hidden />
              <span>{t.videoCard.processingVideo}</span>
            </div>
            <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-white/92 shadow-lg transition-transform duration-300 group-hover:scale-105">
                <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 transition-all duration-300 group-hover:bg-foreground/10 motion-reduce:group-hover:bg-foreground/0">
            <div className="flex size-12 scale-75 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-lg transition-all duration-300 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100 motion-reduce:group-hover:scale-75 motion-reduce:group-hover:opacity-0">
              <Play className="ml-0.5 size-5 text-primary" fill="currentColor" />
            </div>
          </div>
        )}
      </div>

      <CardContent className="p-4">
        <h3 className="mb-1.5 line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
          {video.title}
        </h3>

        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-xs text-muted">
            <ExternalLink className="size-3" />
            {sourceLabel(video.source)}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-1">
            {video.listProvenance === "default-taiwan-cities" && (
              <Badge variant="secondary" className="bg-primary/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-foreground/70 hover:bg-primary/15">
                {t.home.sourceDefault}
              </Badge>
            )}
            {video.listProvenance === "mock-fallback" && (
              <Badge variant="secondary" className="bg-secondary/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-foreground/70 hover:bg-secondary/20">
                {t.home.sourceFallback}
              </Badge>
            )}
            {video.extractedLocations.slice(0, 2).map((location, locIdx) => (
              <Badge
                key={`${video.id}_loc_${locIdx}_${location.name}`}
                variant="secondary"
                className="bg-tertiary/20 px-1.5 py-0.5 text-[10px] text-foreground/70 hover:bg-tertiary/20"
              >
                {location.name}
              </Badge>
            ))}
            {video.extractedLocations.length > 2 && (
              <span className="text-[10px] text-muted">
                +{video.extractedLocations.length - 2} {t.videoCard.morePlaces}
              </span>
            )}
          </div>
        </div>
      </CardContent>
      </Card>
    </m.div>
  );
}

export default memo(VideoCard);
