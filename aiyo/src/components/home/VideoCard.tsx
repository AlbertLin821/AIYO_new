"use client";

import { memo, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { AlertCircle, Clock, ExternalLink, Play } from "lucide-react";
import type { Video } from "@/types";
import { zhTW as t } from "@/locales/zh-TW";

interface VideoCardProps {
  video: Video;
  index: number;
  onClick: () => void;
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

function VideoCard({ video, index, onClick }: VideoCardProps) {
  const thumbLabels = t.videoCard.thumbLabels;
  const [imageFailed, setImageFailed] = useState(false);
  const showThumbnail = Boolean(video.thumbnail) && !imageFailed;
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
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`${t.videoCard.openVideoSummary}：${video.title}`}
      data-testid="recommended-video"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      className="group cursor-pointer overflow-hidden rounded-2xl bg-surface shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-soft-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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

        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-all duration-300 flex items-center justify-center">
          <div className="size-12 rounded-full bg-white/90 shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-75 group-hover:scale-100">
            <Play className="size-5 text-primary ml-0.5" fill="currentColor" />
          </div>
        </div>
      </div>

      <div className="p-4">
        <h3 className="font-semibold text-sm text-foreground leading-snug line-clamp-2 mb-1.5 group-hover:text-primary transition-colors">
          {video.title}
        </h3>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted flex items-center gap-1">
            <ExternalLink className="size-3" />
            {sourceLabel(video.source)}
          </span>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {video.listProvenance === "default-taiwan-cities" && (
              <span className="text-[9px] uppercase tracking-wide rounded-full bg-primary/15 px-1.5 py-0.5 text-foreground/70">
                {t.home.sourceDefault}
              </span>
            )}
            {video.listProvenance === "mock-fallback" && (
              <span className="text-[9px] uppercase tracking-wide rounded-full bg-secondary/20 px-1.5 py-0.5 text-foreground/70">
                {t.home.sourceFallback}
              </span>
            )}
            {video.extractedLocations.slice(0, 2).map((location) => (
              <span
                key={`${video.id}_${location.name}`}
                className="text-[10px] px-1.5 py-0.5 bg-tertiary/20 text-foreground/70 rounded-full"
              >
                {location.name}
              </span>
            ))}
            {video.extractedLocations.length > 2 && (
              <span className="text-[10px] text-muted">
                +{video.extractedLocations.length - 2} {t.videoCard.morePlaces}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default memo(VideoCard);
