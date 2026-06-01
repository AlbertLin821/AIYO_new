"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, CalendarDays, Copy, Loader2, MapPin } from "lucide-react";
import {
  copyPublicItinerary,
  getPublicItineraryDetail,
} from "@/services/publicItineraryClient";
import { setActiveTrip } from "@/services/itineraryClient";
import { syncService } from "@/services/syncService";
import { useToastStore } from "@/stores/useToastStore";
import type { PublicItineraryDetail } from "@/types";
import { zhTW as t } from "@/locales/zh-TW";

const PublicItineraryMap = dynamic(() => import("@/components/map/PublicItineraryMap"), {
  ssr: false,
});

function itemTypeLabel(type: string) {
  const labels = t.publicItinerary.itemTypes as Record<string, string>;
  return labels[type] ?? type;
}

export default function PublicItineraryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const publicationId = typeof params.publicationId === "string" ? params.publicationId : "";
  const { status } = useSession();
  const pushToast = useToastStore((state) => state.pushToast);

  const [detail, setDetail] = useState<PublicItineraryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCopying, setIsCopying] = useState(false);
  const [copiedTripId, setCopiedTripId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent(`/itinerary/public/${publicationId}`)}`);
    }
  }, [publicationId, router, status]);

  const loadDetail = useCallback(async () => {
    if (!publicationId || status !== "authenticated") {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPublicItineraryDetail(publicationId);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.publicItinerary.loadFailed);
    } finally {
      setIsLoading(false);
    }
  }, [publicationId, status]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function handleCopy() {
    if (!publicationId) {
      return;
    }
    setIsCopying(true);
    try {
      const result = await copyPublicItinerary(publicationId);
      pushToast({
        variant: "success",
        title: t.publicItinerary.copySuccessTitle,
        description: t.publicItinerary.copySuccessDesc,
      });
      setCopiedTripId(result.tripId);
    } catch (err) {
      pushToast({
        variant: "error",
        title: t.publicItinerary.copyFailedTitle,
        description: err instanceof Error ? err.message : t.publicItinerary.copyFailedDesc,
      });
    } finally {
      setIsCopying(false);
    }
  }

  async function switchToCopiedTrip() {
    if (!copiedTripId) {
      return;
    }
    const snapshot = await setActiveTrip(copiedTripId);
    syncService.applyTripSwitch(snapshot);
    syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-4xl px-5 py-8 lg:px-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t.publicItinerary.backHome}
        </Link>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-muted">
            <Loader2 className="size-5 animate-spin" />
            <span>{t.publicItinerary.loading}</span>
          </div>
        ) : error || !detail ? (
          <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error ?? t.publicItinerary.loadFailed}
          </div>
        ) : (
          <>
            <section className="overflow-hidden rounded-2xl border border-border-light bg-surface shadow-soft">
              <div className="relative min-h-[200px] bg-surface-elevated">
                {detail.snapshot.coverImageUrl ? (
                  <Image
                    src={detail.snapshot.coverImageUrl}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="flex min-h-[200px] items-center justify-center">
                    <CalendarDays className="size-16 text-primary/40" />
                  </div>
                )}
              </div>
              <div className="p-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {t.publicItinerary.readOnlyBadge}
                </p>
                <h1 className="mt-1 text-2xl font-bold text-foreground">{detail.snapshot.title}</h1>
                <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
                  {detail.snapshot.destination ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-4 text-secondary" />
                      {detail.snapshot.destination}
                    </span>
                  ) : null}
                  <span>
                    {detail.snapshot.days} {t.publicItinerary.daysUnit}
                  </span>
                </div>
              </div>
            </section>

            <section className="mt-8">
              <h2 className="mb-3 text-lg font-semibold text-foreground">{t.publicItinerary.mapTitle}</h2>
              <PublicItineraryMap pins={detail.snapshot.pins} />
            </section>

            <section className="mt-8 space-y-6">
              <h2 className="text-lg font-semibold text-foreground">{t.publicItinerary.scheduleTitle}</h2>
              {detail.snapshot.itinerary.map((day) => (
                <div
                  key={day.dayNumber}
                  className="rounded-2xl border border-border-light bg-surface p-5 shadow-soft"
                >
                  <h3 className="mb-4 font-semibold text-foreground">
                    {t.publicItinerary.dayLabel.replace("{n}", String(day.dayNumber))}
                  </h3>
                  <ul className="space-y-4">
                    {day.items.map((item) => (
                      <li
                        key={item.id}
                        className="border-l-2 border-primary/30 pl-4"
                        data-testid="public-itinerary-item"
                      >
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-xs font-medium text-primary">{item.time}</span>
                          <span className="text-sm font-semibold text-foreground">{item.title}</span>
                          <span className="rounded-full bg-cream/60 px-2 py-0.5 text-[10px] text-muted">
                            {itemTypeLabel(item.type)}
                          </span>
                        </div>
                        {item.location?.name ? (
                          <p className="mt-1 text-sm text-muted">{item.location.name}</p>
                        ) : null}
                        {item.transport ? (
                          <p className="mt-1 text-xs text-muted">
                            {t.publicItinerary.transportPrefix}
                            {item.transport}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          </>
        )}
      </div>

      {detail && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border-light bg-surface/95 p-4 backdrop-blur-sm">
          <div className="mx-auto flex max-w-4xl justify-center">
            {copiedTripId ? (
              <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    void switchToCopiedTrip().then(() => {
                      router.push(`/trip/${encodeURIComponent(copiedTripId)}`);
                    });
                  }}
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
                >
                  去看地圖
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void switchToCopiedTrip().then(() => {
                      router.push(`/itinerary?tripId=${encodeURIComponent(copiedTripId)}`);
                    });
                  }}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-border-light bg-surface px-4 py-3 text-sm font-semibold text-foreground hover:bg-border-light"
                >
                  編輯行程
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={isCopying}
                data-testid="copy-public-itinerary-button"
                className="inline-flex w-full max-w-md items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60 sm:w-auto"
              >
                {isCopying ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Copy className="size-4" />
                )}
                {t.publicItinerary.copyCta}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
