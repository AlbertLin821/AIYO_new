"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { CalendarDays, Globe, MapPin, Share2 } from "lucide-react";
import type { Session } from "next-auth";
import { zhTW as t } from "@/locales/zh-TW";
import { normalizeTripBudget, normalizeTripDayCount } from "@/lib/tripMetaEdit";

type Props = {
  title: string;
  destination: string;
  days: number;
  budget: number;
  coverImageUrl: string | null;
  session: Session | null;
  isInteractive: boolean;
  metaEditable?: boolean;
  /** 尚無目的地、天數、預算與行程內容時不顯示摘要格 */
  showTripSummaryRow: boolean;
  onShare: () => void;
  onOpenMap: () => void;
  onDaysCommit?: (days: number) => void | Promise<void>;
  onBudgetCommit?: (budget: number) => void | Promise<void>;
  onPublish?: () => void;
  isPublished?: boolean;
  isPublishing?: boolean;
  canPublish?: boolean;
  onUnpublish?: () => void;
};

function formatBudgetLabel(budget: number): string {
  return budget > 0 ? `NT$${budget.toLocaleString("zh-TW")}` : t.common.notSet;
}

function ItineraryPageHeader({
  title,
  destination,
  days,
  budget,
  coverImageUrl,
  session,
  isInteractive,
  metaEditable = false,
  showTripSummaryRow,
  onShare,
  onOpenMap,
  onDaysCommit,
  onBudgetCommit,
  onPublish,
  isPublished = false,
  isPublishing = false,
  canPublish = true,
  onUnpublish,
}: Props) {
  const [editingDays, setEditingDays] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [daysDraft, setDaysDraft] = useState(String(days));
  const [budgetDraft, setBudgetDraft] = useState(budget > 0 ? String(budget) : "");
  const daysInputRef = useRef<HTMLInputElement>(null);
  const budgetInputRef = useRef<HTMLInputElement>(null);

  const displayTitle = title.trim() || t.itineraryPage.title;
  const displayDestination = destination.trim() || t.common.notSet;
  const canEditDays = metaEditable && Boolean(onDaysCommit);
  const canEditBudget = metaEditable && Boolean(onBudgetCommit);

  useEffect(() => {
    if (!editingDays) {
      setDaysDraft(String(days));
    }
  }, [days, editingDays]);

  useEffect(() => {
    if (!editingBudget) {
      setBudgetDraft(budget > 0 ? String(budget) : "");
    }
  }, [budget, editingBudget]);

  useEffect(() => {
    if (editingDays) {
      daysInputRef.current?.focus();
      daysInputRef.current?.select();
    }
  }, [editingDays]);

  useEffect(() => {
    if (editingBudget) {
      budgetInputRef.current?.focus();
      budgetInputRef.current?.select();
    }
  }, [editingBudget]);

  const commitDays = useCallback(async () => {
    setEditingDays(false);
    if (!onDaysCommit) {
      return;
    }
    const parsed = Number(daysDraft.trim());
    if (!Number.isFinite(parsed)) {
      setDaysDraft(String(days));
      return;
    }
    const nextDays = normalizeTripDayCount(parsed);
    if (nextDays === normalizeTripDayCount(days)) {
      setDaysDraft(String(days));
      return;
    }
    await onDaysCommit(nextDays);
  }, [days, daysDraft, onDaysCommit]);

  const commitBudget = useCallback(async () => {
    setEditingBudget(false);
    if (!onBudgetCommit) {
      return;
    }
    const trimmed = budgetDraft.trim();
    const parsed = trimmed.length === 0 ? 0 : Number(trimmed.replace(/,/g, ""));
    if (!Number.isFinite(parsed)) {
      setBudgetDraft(budget > 0 ? String(budget) : "");
      return;
    }
    const nextBudget = normalizeTripBudget(parsed);
    if (nextBudget === normalizeTripBudget(budget)) {
      setBudgetDraft(budget > 0 ? String(budget) : "");
      return;
    }
    await onBudgetCommit(nextBudget);
  }, [budget, budgetDraft, onBudgetCommit]);

  const cancelDays = useCallback(() => {
    setEditingDays(false);
    setDaysDraft(String(days));
  }, [days]);

  const cancelBudget = useCallback(() => {
    setEditingBudget(false);
    setBudgetDraft(budget > 0 ? String(budget) : "");
  }, [budget]);

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
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-cream/45 px-3 py-2">
                <p className="text-[11px] text-muted">目的地</p>
                <p className="truncate text-sm font-semibold text-foreground">{displayDestination}</p>
              </div>
              <div className="rounded-xl bg-cream/45 px-3 py-2">
                <p className="text-[11px] text-muted">{t.itineraryPage.metaDays}</p>
                {editingDays ? (
                  <input
                    ref={daysInputRef}
                    type="number"
                    min={1}
                    max={30}
                    inputMode="numeric"
                    value={daysDraft}
                    data-testid="itinerary-meta-days-input"
                    onChange={(event) => setDaysDraft(event.target.value)}
                    onBlur={() => void commitDays()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void commitDays();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelDays();
                      }
                    }}
                    className="mt-0.5 w-full rounded-lg border border-primary/30 bg-surface px-2 py-1 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                ) : canEditDays ? (
                  <button
                    type="button"
                    data-testid="itinerary-meta-days-button"
                    title={t.itineraryPage.metaDaysEditHint}
                    onClick={() => setEditingDays(true)}
                    className="mt-0.5 text-left text-sm font-semibold text-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-primary"
                  >
                    {days}
                  </button>
                ) : (
                  <p className="text-sm font-semibold text-foreground">{days}</p>
                )}
              </div>
              <div className="rounded-xl bg-cream/45 px-3 py-2">
                <p className="text-[11px] text-muted">預算</p>
                {editingBudget ? (
                  <input
                    ref={budgetInputRef}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={budgetDraft}
                    placeholder={t.itineraryPage.metaBudgetPlaceholder}
                    data-testid="itinerary-meta-budget-input"
                    onChange={(event) => setBudgetDraft(event.target.value)}
                    onBlur={() => void commitBudget()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void commitBudget();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelBudget();
                      }
                    }}
                    className="mt-0.5 w-full rounded-lg border border-primary/30 bg-surface px-2 py-1 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                ) : canEditBudget ? (
                  <button
                    type="button"
                    data-testid="itinerary-meta-budget-button"
                    title={t.itineraryPage.metaBudgetEditHint}
                    onClick={() => setEditingBudget(true)}
                    className="mt-0.5 truncate text-left text-sm font-semibold text-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-primary"
                  >
                    {formatBudgetLabel(budget)}
                  </button>
                ) : (
                  <p className="truncate text-sm font-semibold text-foreground">
                    {formatBudgetLabel(budget)}
                  </p>
                )}
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
            {onPublish && (
              <button
                type="button"
                onClick={onPublish}
                disabled={!canPublish || isPublishing}
                data-testid="publish-itinerary-button"
                className="inline-flex items-center gap-2 rounded-xl border border-border-light bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-soft transition-colors hover:bg-cream/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Globe className="size-4 text-primary" />
                {isPublishing
                  ? t.itineraryPage.publishing
                  : isPublished
                    ? t.itineraryPage.republish
                    : t.itineraryPage.publish}
              </button>
            )}
            {isPublished && onUnpublish && (
              <button
                type="button"
                onClick={onUnpublish}
                disabled={isPublishing}
                data-testid="unpublish-itinerary-button"
                className="inline-flex items-center gap-2 rounded-xl border border-border-light bg-surface px-4 py-2.5 text-sm font-medium text-muted shadow-soft transition-colors hover:bg-cream/60 disabled:opacity-60"
              >
                {t.itineraryPage.unpublish}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(ItineraryPageHeader);
