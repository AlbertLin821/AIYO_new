"use client";

import { memo } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { CalendarDays, Copy, MapPin, Folder, PencilLine, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import type { ItineraryListItem } from "@/lib/itinerary-sort";

type Props = {
  item: ItineraryListItem;
  index: number;
  disabled?: boolean;
  duplicating?: boolean;
  onClick: (item: ItineraryListItem) => void;
  onEdit?: (item: ItineraryListItem) => void;
  onDuplicate?: (item: ItineraryListItem) => void;
  onDelete?: (item: ItineraryListItem) => void;
};

function TripLandingCard({ item, index, disabled, duplicating, onClick, onEdit, onDuplicate, onDelete }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-2xl border border-border-light bg-surface text-left shadow-soft transition-all duration-200",
        "hover:border-primary/40 hover:shadow-md hover:-translate-y-1",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <button
        type="button"
        onClick={() => onClick(item)}
        disabled={disabled}
        className="flex w-full flex-col text-left"
      >
        <div className="relative h-40 w-full shrink-0 overflow-hidden bg-surface-elevated">
          {item.coverImageUrl ? (
            <Image
              src={item.coverImageUrl}
              alt=""
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              unoptimized
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/5 to-lavender/10">
              <Folder
                className="size-16 text-border-strong transition-colors group-hover:text-primary"
                strokeWidth={1}
              />
            </div>
          )}
          {item.isOwner === false && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
              <Users className="size-3" />
              {t.itineraryPage.folderMetaCollaborative}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="truncate text-base font-semibold text-foreground group-hover:text-primary transition-colors">
            {item.title}
          </h3>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {item.destination || "--"}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" />
              {t.itineraryPage.folderMetaDays.replace("{n}", String(item.days))}
            </span>
          </div>
          <p className="mt-auto truncate text-[11px] text-muted">
            {item.folderName || t.itineraryPage.unfiledFolder} ·{" "}
            {t.itineraryPage.folderMetaUpdated}{" "}
            {new Date(item.updatedAt).toLocaleDateString("zh-TW")}
          </p>
        </div>
      </button>

      {(onEdit || onDuplicate || onDelete) && (
        <div className="absolute right-2 top-2 z-20 flex gap-1 rounded-lg bg-surface/95 p-1 opacity-0 shadow-soft transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {onEdit && (
            <button
              type="button"
              disabled={disabled}
              aria-label={(item.isOwner ? t.itineraryPage.renameTripAria : t.itineraryPage.editTripAria).replace("{title}", item.title)}
              title={item.isOwner ? t.itineraryPage.renameTrip : t.itineraryPage.editTrip}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(item);
              }}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-cream/70 hover:text-primary disabled:opacity-40"
            >
              <PencilLine className="size-4" aria-hidden />
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              disabled={disabled || duplicating}
              aria-label={t.itineraryPage.duplicateTripAria.replace("{title}", item.title)}
              title={t.itineraryPage.duplicateTrip}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDuplicate(item);
              }}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-cream/70 hover:text-secondary disabled:opacity-40"
            >
              <Copy className="size-4" aria-hidden />
            </button>
          )}
          {onDelete && item.isOwner && (
            <button
              type="button"
              disabled={disabled}
              aria-label={t.itineraryPage.deleteTripAria.replace("{title}", item.title)}
              title={t.itineraryPage.deleteTrip}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(item);
              }}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-cream/70 hover:text-danger disabled:opacity-40"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default memo(TripLandingCard);
