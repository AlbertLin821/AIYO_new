"use client";

import Image from "next/image";
import { CalendarDays, Copy, PencilLine, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import type { ItineraryListItem } from "@/lib/itinerary-sort";

type Props = {
  item: ItineraryListItem;
  active: boolean;
  compact: boolean;
  disabledActions: boolean;
  tripDuplicatingId: string | null;
  status: "authenticated" | "loading" | "unauthenticated";
  onSelectTrip: (item: ItineraryListItem) => void;
  onEditTrip: (item: ItineraryListItem) => void;
  onDuplicateTrip: (item: ItineraryListItem) => void;
  onDeleteTrip: (item: ItineraryListItem) => void;
};

export default function TripLibraryItem({
  item,
  active,
  compact,
  disabledActions,
  tripDuplicatingId,
  status,
  onSelectTrip,
  onEditTrip,
  onDuplicateTrip,
  onDeleteTrip,
}: Props) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-surface text-left transition-colors",
        active ? "border-primary/50 ring-2 ring-primary/10" : "border-border-light hover:border-primary/30",
        disabledActions && "pointer-events-none opacity-50",
      )}
    >
      <button
        type="button"
        disabled={disabledActions}
        aria-label={t.itineraryPage.editTripAria.replace("{title}", item.title)}
        onClick={() => onSelectTrip(item)}
        className={cn("flex w-full text-left", compact ? "items-center gap-3 px-3 py-3" : "flex-col")}
      >
        {compact ? (
          <CalendarDays className="size-8 shrink-0 text-primary/35" strokeWidth={1.2} />
        ) : (
          <div className="relative h-[110px] w-full shrink-0 overflow-hidden bg-surface-elevated">
            {item.coverImageUrl ? (
              <Image src={item.coverImageUrl} alt="" fill className="object-cover" unoptimized sizes="280px" />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/8 via-lavender/10 to-cream/40 py-6">
                <CalendarDays
                  className="size-14 text-primary/35 transition-colors group-hover:text-primary/55"
                  strokeWidth={1.2}
                />
              </div>
            )}
          </div>
        )}
        <div className={cn("min-w-0 flex-1", compact ? "" : "border-t border-border-light p-3")}>
          <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
          <p className="mt-1 truncate text-xs font-semibold text-primary">
            {item.isOwner === false ? `${t.itineraryPage.folderMetaCollaborative} · ` : ""}
            {item.destination} · {t.itineraryPage.folderMetaDays.replace("{n}", String(item.days))}
          </p>
          {!compact && (
            <p className="mt-2 truncate text-[11px] text-muted">
              {t.itineraryPage.folderMetaUpdated}{" "}
              {new Date(item.updatedAt).toLocaleDateString("zh-TW")}
            </p>
          )}
        </div>
      </button>
      {status === "authenticated" && (
        <div
          className="absolute right-2 top-2 z-20 flex gap-1 rounded-lg bg-surface/95 p-1 opacity-0 shadow-soft transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            disabled={disabledActions}
            aria-label={(item.isOwner ? t.itineraryPage.renameTripAria : t.itineraryPage.editTripAria).replace(
              "{title}",
              item.title,
            )}
            title={item.isOwner ? t.itineraryPage.renameTrip : t.itineraryPage.editTrip}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onEditTrip(item);
            }}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-cream/70 hover:text-primary disabled:opacity-40"
          >
            <PencilLine className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            data-testid={`library-duplicate-trip-${item.id}`}
            disabled={disabledActions || tripDuplicatingId === item.id}
            aria-label={t.itineraryPage.duplicateTripAria.replace("{title}", item.title)}
            title={t.itineraryPage.duplicateTrip}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDuplicateTrip(item);
            }}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-cream/70 hover:text-secondary disabled:opacity-40"
          >
            <Copy className="size-4" aria-hidden />
          </button>
          {item.isOwner && (
            <button
              type="button"
              data-testid={`library-delete-trip-${item.id}`}
              disabled={disabledActions}
              aria-label={t.itineraryPage.deleteTripAria.replace("{title}", item.title)}
              title={t.itineraryPage.deleteTrip}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDeleteTrip(item);
              }}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-cream/70 hover:text-danger disabled:opacity-40"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
