"use client";

import { memo, type KeyboardEvent } from "react";
import Image from "next/image";
import { m } from "@/lib/motion";
import { CalendarDays, MapPin } from "lucide-react";
import type { PublicItinerarySummary } from "@/types";
import { zhTW as t } from "@/locales/zh-TW";

interface Props {
  itinerary: PublicItinerarySummary;
  index: number;
  onClick: () => void;
}

function formatPublishedAt(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function RecommendedItineraryCard({ itinerary, index, onClick }: Props) {
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  }

  return (
    <m.div
      role="button"
      tabIndex={0}
      data-testid="recommended-itinerary-card"
      aria-label={`${t.publicItinerary.openDetail}：${itinerary.title}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="group cursor-pointer overflow-hidden rounded-2xl bg-surface shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-soft-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="relative aspect-video bg-gradient-to-br from-primary/15 via-lavender/15 to-secondary/15">
        {itinerary.coverImageUrl ? (
          <Image
            src={itinerary.coverImageUrl}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <CalendarDays className="size-12 text-primary/40" strokeWidth={1.4} />
          </div>
        )}

        {itinerary.publisherImage ? (
          <Image
            src={itinerary.publisherImage}
            alt=""
            width={32}
            height={32}
            unoptimized
            referrerPolicy="no-referrer"
            className="absolute right-2 top-2 size-8 rounded-full border-2 border-white object-cover shadow-md"
            aria-label={t.publicItinerary.authorAvatarAria}
          />
        ) : (
          <div
            className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full border-2 border-white bg-surface text-xs font-medium text-primary shadow-md"
            aria-label={t.publicItinerary.authorAvatarAria}
          >
            ?
          </div>
        )}

        <div className="absolute bottom-2 left-2 rounded-md bg-foreground/70 px-2 py-0.5 text-xs font-medium text-white">
          {itinerary.days} {t.publicItinerary.daysUnit}
        </div>
      </div>

      <div className="p-4">
        <h3 className="mb-1.5 line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
          {itinerary.title}
        </h3>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          {itinerary.destination ? (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin className="size-3 shrink-0" />
              {itinerary.destination}
            </span>
          ) : (
            <span />
          )}
          <span>{formatPublishedAt(itinerary.publishedAt)}</span>
        </div>
      </div>
    </m.div>
  );
}

export default memo(RecommendedItineraryCard);
