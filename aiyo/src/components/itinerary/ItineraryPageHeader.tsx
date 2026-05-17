"use client";

import { memo } from "react";
import Image from "next/image";
import { CalendarDays, MapPin, Share2 } from "lucide-react";
import type { Session } from "next-auth";
import { zhTW as t } from "@/locales/zh-TW";

type Props = {
  title: string;
  destination: string;
  days: number;
  budget: number;
  coverImageUrl: string | null;
  lastUpdatedAt: string | null;
  session: Session | null;
  isInteractive: boolean;
  /** 尚無目的地、天數、預算與行程內容時不顯示摘要格 */
  showTripSummaryRow: boolean;
  onShare: () => void;
  onOpenMap: () => void;
};

function ItineraryPageHeader({
  title,
  destination,
  days,
  budget,
  coverImageUrl,
  lastUpdatedAt,
  session,
  isInteractive,
  showTripSummaryRow,
  onShare,
  onOpenMap,
}: Props) {
  const displayTitle = title.trim() || t.itineraryPage.title;
  const displayDestination = destination.trim() || t.common.notSet;
  const updatedLabel = lastUpdatedAt
    ? `${t.itineraryPage.updatedPrefix} ${new Date(lastUpdatedAt).toLocaleString("zh-TW")}`
    : t.itineraryPage.updatedPrefix;

  return (
    <section className="overflow-hidden rounded-2xl border border-border-light bg-surface shadow-soft">
      <div className="grid gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="relative min-h-[180px] bg-surface-elevated">
          {coverImageUrl ? (
            <Image
              src={coverImageUrl}
              alt=""
              fill
              unoptimized
              sizes="(max-width: 1024px) 100vw, 280px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full min-h-[180px] items-center justify-center bg-primary/8">
              <CalendarDays className="size-16 text-primary/45" strokeWidth={1.4} />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col justify-between gap-6 p-5 lg:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {t.itineraryPage.currentTripSummary}
              </p>
              <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-foreground">
                {displayTitle}
              </h1>
              <p className="mt-2 text-sm text-muted">{t.itineraryPage.subtitle}</p>
            </div>
            {session?.user && (
              <div className="shrink-0" title={session.user.email || undefined}>
                {session.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- OAuth 頭像為外部 URL
                  <img
                    src={session.user.image}
                    alt=""
                    width={36}
                    height={36}
                    className="size-9 rounded-full border border-border object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-xs font-medium text-primary shadow-soft"
                    aria-label={t.itineraryPage.userAvatarAria}
                  >
                    {(session.user.name || session.user.email || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
            )}
          </div>

          {showTripSummaryRow && (
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-cream/45 px-3 py-2">
                <p className="text-[11px] text-muted">目的地</p>
                <p className="truncate text-sm font-semibold text-foreground">{displayDestination}</p>
              </div>
              <div className="rounded-xl bg-cream/45 px-3 py-2">
                <p className="text-[11px] text-muted">{t.itineraryPage.metaDays}</p>
                <p className="text-sm font-semibold text-foreground">{days}</p>
              </div>
              <div className="rounded-xl bg-cream/45 px-3 py-2">
                <p className="text-[11px] text-muted">預算</p>
                <p className="truncate text-sm font-semibold text-foreground">
                  {budget > 0 ? `NT$${budget.toLocaleString("zh-TW")}` : t.common.notSet}
                </p>
              </div>
              <div className="rounded-xl bg-cream/45 px-3 py-2">
                <p className="text-[11px] text-muted">狀態</p>
                <p className="truncate text-sm font-semibold text-foreground">{updatedLabel}</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onShare}
              disabled={!isInteractive}
              data-testid="share-collaboration-button"
              className="inline-flex items-center gap-2 rounded-xl border border-border-light bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-soft transition-colors hover:bg-cream/60 disabled:cursor-wait disabled:opacity-60"
            >
              <Share2 className="size-4 text-primary" />
              {t.itineraryPage.share}
            </button>
            <button
              type="button"
              onClick={onOpenMap}
              className="inline-flex items-center gap-2 rounded-xl border border-border-light bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-soft transition-colors hover:bg-cream/60"
            >
              <MapPin className="size-4 text-secondary" />
              {t.itineraryPage.workflowMap}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(ItineraryPageHeader);
