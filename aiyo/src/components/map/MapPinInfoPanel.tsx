"use client";

import { X } from "lucide-react";
import type { MapPin as MapPinType } from "@/types";
import { zhTW as t } from "@/locales/zh-TW";
import { cn } from "@/lib/utils";
import PlaceThumbnail from "@/components/map/PlaceThumbnail";
import {
  buildGoogleMapsUrl,
  buildLocationBackfilledPin,
  buildRoutePlanningUrl,
  normalizeOpeningHours,
  pinSourceLabel,
  type LinkedItineraryItem,
} from "@/components/map/mapPinInfoShared";

type MapPinInfoPanelProps = {
  pin: MapPinType;
  linkedItem?: LinkedItineraryItem;
  onClose?: () => void;
  className?: string;
};

export default function MapPinInfoPanel({ pin, linkedItem, onClose, className }: MapPinInfoPanelProps) {
  const resolvedPin = buildLocationBackfilledPin(pin, linkedItem);
  const routeUrl = buildRoutePlanningUrl(resolvedPin);
  const googleMapsUrl = buildGoogleMapsUrl(resolvedPin);
  const empty = t.map.notProvided;
  const openingHoursRows = normalizeOpeningHours(resolvedPin.openingHours);

  return (
    <article
      data-testid="map-pin-info-panel"
      className={cn(
        "w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface text-foreground shadow-soft-lg",
        className,
      )}
    >
      <div className="relative">
        <PlaceThumbnail
          src={resolvedPin.thumbnail || resolvedPin.photoUrl}
          alt={t.map.infoThumbnail}
          placeholder={t.map.infoThumbnail}
        />
        {onClose && (
          <button
            type="button"
            aria-label={t.common.closeDialog}
            onClick={onClose}
            className="absolute right-2 top-2 flex size-8 cursor-pointer items-center justify-center rounded-full border border-border bg-surface/95 text-muted shadow-soft transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="px-3 pb-3 pt-3">
        <div className="flex items-start gap-2">
          <span
            className="mt-1 size-3 shrink-0 rounded-full shadow-[0_0_0_3px_rgba(255,255,255,.9),0_2px_8px_rgba(0,0,0,.18)]"
            style={{ backgroundColor: resolvedPin.color || "#5a7ea3" }}
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold leading-snug text-foreground">{resolvedPin.name}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {resolvedPin.description || t.map.noDescription}
            </p>
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1.5 text-xs leading-relaxed">
          <dt className="text-muted">{t.map.infoAddress}</dt>
          <dd>{resolvedPin.address || empty}</dd>
          <dt className="text-muted">{t.map.infoOpeningHours}</dt>
          <dd>
            {openingHoursRows.length > 0 ? (
              <ul className="grid gap-0.5">
                {openingHoursRows.map((row, index) => (
                  <li key={`${row.day}-${index}`}>
                    {row.day ? (
                      <>
                        <span className="inline-block min-w-[34px] text-muted">{row.day}</span>
                        {row.hours}
                      </>
                    ) : (
                      row.hours
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              empty
            )}
          </dd>
          <dt className="text-muted">{t.map.infoPhone}</dt>
          <dd>{resolvedPin.phoneNumber || empty}</dd>
          <dt className="text-muted">{t.map.infoSource}</dt>
          <dd>
            {pinSourceLabel(resolvedPin.source)}
            {resolvedPin.dayNumber ? ` · D${resolvedPin.dayNumber}` : ""}
          </dd>
        </dl>

        <a
          href={routeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center rounded-[10px] bg-[#426991] px-3 py-2.5 text-xs font-bold text-white no-underline"
        >
          {t.map.infoRoute}
        </a>
        {googleMapsUrl && (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center justify-center rounded-[10px] border border-border px-3 py-2.5 text-xs font-bold text-foreground no-underline"
          >
            {t.map.infoGoogleMaps}
          </a>
        )}
      </div>
    </article>
  );
}
