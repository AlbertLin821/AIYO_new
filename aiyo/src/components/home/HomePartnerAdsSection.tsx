"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import TravelAdCard from "@/components/home/TravelAdCard";
import { TRAVEL_AD_PREVIEWS } from "@/data/travelAdPreviews";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";

export default function HomePartnerAdsSection({ className }: { className?: string }) {
  const adScrollRef = useRef<HTMLDivElement | null>(null);

  return (
    <section className={cn("mt-12 mb-6", className)} data-testid="home-partner-ads">
      <h3 className="mb-4 text-sm font-semibold text-muted">{t.home.adSectionTitle}</h3>
      <div className="group relative">
        <button
          type="button"
          aria-label={t.home.adScrollPrev}
          onClick={() => {
            const el = adScrollRef.current;
            if (el) {
              el.scrollBy({ left: -340, behavior: "smooth" });
            }
          }}
          className="absolute -left-3 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border-light bg-white/90 text-foreground opacity-0 shadow-md backdrop-blur-sm transition-opacity hover:bg-white group-hover:opacity-100"
        >
          <ChevronLeft className="size-5" />
        </button>

        <div
          ref={adScrollRef}
          className="flex gap-4 overflow-x-auto pb-3 scroll-smooth"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {TRAVEL_AD_PREVIEWS.map((ad) => (
            <TravelAdCard key={ad.id} ad={ad} />
          ))}
        </div>

        <button
          type="button"
          aria-label={t.home.adScrollNext}
          onClick={() => {
            const el = adScrollRef.current;
            if (el) {
              el.scrollBy({ left: 340, behavior: "smooth" });
            }
          }}
          className="absolute -right-3 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border-light bg-white/90 text-foreground opacity-0 shadow-md backdrop-blur-sm transition-opacity hover:bg-white group-hover:opacity-100"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
    </section>
  );
}
