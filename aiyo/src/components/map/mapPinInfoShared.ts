import type { LocationReference, MapPin as MapPinType } from "@/types";
import { resolvePlacePhotoUrl } from "@/lib/placePhotoUrl";
import { zhTW as t } from "@/locales/zh-TW";

export type LinkedItineraryItem = {
  time: string;
  title: string;
  type: string;
  transport?: string;
  notes?: string;
  location?: LocationReference;
};

export function pinSourceLabel(source: string | undefined) {
  if (!source || source === "manual") {
    return t.map.sourceManual;
  }
  if (source === "itinerary") {
    return t.map.sourceItinerary;
  }
  if (source === "video") {
    return t.map.sourceVideo;
  }
  return source;
}

export function buildLocationBackfilledPin(
  pin: MapPinType,
  linkedItem?: LinkedItineraryItem,
): MapPinType {
  const location = linkedItem?.location;
  if (!location) {
    return pin;
  }
  return {
    ...pin,
    description: pin.description || linkedItem?.notes || location.description,
    address: pin.address || location.address,
    placeId: pin.placeId || location.placeId,
    photoUrl: pin.photoUrl || location.photoUrl,
    thumbnail: pin.thumbnail || location.thumbnail || location.photoUrl,
    openingHours: pin.openingHours || location.openingHours,
    phoneNumber: pin.phoneNumber || location.phoneNumber,
    website: pin.website || location.website,
    googleMapsUrl: pin.googleMapsUrl || location.googleMapsUrl,
    rating: pin.rating ?? location.rating,
    userRatingsTotal: pin.userRatingsTotal ?? location.userRatingsTotal,
    confidence: pin.confidence ?? location.confidence,
    verified: pin.verified ?? location.verified,
  };
}

export function buildRoutePlanningUrl(pin: Pick<MapPinType, "lat" | "lng" | "address" | "placeId">): string {
  const routeParams = new URLSearchParams({
    api: "1",
    destination: `${pin.lat},${pin.lng}`,
  });
  if (pin.placeId) {
    routeParams.set("destination_place_id", pin.placeId);
  }
  return `https://www.google.com/maps/dir/?${routeParams.toString()}`;
}

export function buildGoogleMapsUrl(pin: Pick<MapPinType, "lat" | "lng" | "placeId" | "googleMapsUrl">): string | null {
  if (pin.googleMapsUrl) {
    return pin.googleMapsUrl;
  }
  if (!pin.placeId) {
    return null;
  }
  const params = new URLSearchParams({
    api: "1",
    query: `${pin.lat},${pin.lng}`,
    query_place_id: pin.placeId,
  });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

const WEEKDAY_ORDER = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"] as const;
const WEEKDAY_ALIASES: Record<string, number> = {
  週一: 0,
  星期一: 0,
  禮拜一: 0,
  Monday: 0,
  Mon: 0,
  週二: 1,
  星期二: 1,
  禮拜二: 1,
  Tuesday: 1,
  Tue: 1,
  週三: 2,
  星期三: 2,
  禮拜三: 2,
  Wednesday: 2,
  Wed: 2,
  週四: 3,
  星期四: 3,
  禮拜四: 3,
  Thursday: 3,
  Thu: 3,
  週五: 4,
  星期五: 4,
  禮拜五: 4,
  Friday: 4,
  Fri: 4,
  週六: 5,
  星期六: 5,
  禮拜六: 5,
  Saturday: 5,
  Sat: 5,
  週日: 6,
  週天: 6,
  星期日: 6,
  星期天: 6,
  禮拜日: 6,
  禮拜天: 6,
  Sunday: 6,
  Sun: 6,
};

export function normalizeOpeningHours(value?: string): Array<{ day: string; hours: string }> {
  const raw = value?.trim();
  if (!raw) {
    return [];
  }
  const rows = raw
    .split(/[；;\n\r]+/u)
    .map((row) => row.trim())
    .filter(Boolean);
  const byDay = new Map<number, string>();
  const unmatched: Array<{ day: string; hours: string }> = [];

  for (const row of rows) {
    const rangeMatch = row.match(
      /(週一|星期一|禮拜一)\s*(?:至|到|-|–|~)\s*(週日|週天|星期日|星期天|禮拜日|禮拜天)\s*[:：]?\s*(.+)$/u,
    );
    if (rangeMatch?.[3]) {
      WEEKDAY_ORDER.forEach((_, index) => byDay.set(index, rangeMatch[3]!.trim()));
      continue;
    }

    const aliases = Object.keys(WEEKDAY_ALIASES).sort((left, right) => right.length - left.length);
    const alias = aliases.find((candidate) => row.toLowerCase().startsWith(candidate.toLowerCase()));
    if (!alias) {
      unmatched.push({ day: "", hours: row });
      continue;
    }
    const dayIndex = WEEKDAY_ALIASES[alias];
    const hours = row
      .slice(alias.length)
      .replace(/^[\s:：,，-]+/u, "")
      .trim();
    byDay.set(dayIndex, hours || row);
  }

  const ordered = WEEKDAY_ORDER.flatMap((day, index) => {
    const hours = byDay.get(index);
    return hours ? [{ day, hours }] : [];
  });
  return ordered.length > 0 ? ordered : unmatched;
}

function escapeHtml(value: string | number | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildOpeningHoursInfoHtml(value: string | undefined, empty: string): string {
  const rows = normalizeOpeningHours(value);
  if (rows.length === 0) {
    return escapeHtml(empty);
  }
  return `<ul style="list-style:none;margin:0;padding:0;display:grid;gap:3px;">${rows
    .map((row) =>
      row.day
        ? `<li><span style="display:inline-block;min-width:34px;color:#6b7280;">${escapeHtml(row.day)}</span>${escapeHtml(row.hours)}</li>`
        : `<li>${escapeHtml(row.hours)}</li>`,
    )
    .join("")}</ul>`;
}

export function buildPinInfoContent(pin: MapPinType, linkedItem?: LinkedItineraryItem): string {
  const resolvedPin = buildLocationBackfilledPin(pin, linkedItem);
  const routeUrl = buildRoutePlanningUrl(resolvedPin);
  const googleMapsUrl = buildGoogleMapsUrl(resolvedPin);
  const thumbnail = resolvePlacePhotoUrl(resolvedPin.thumbnail || resolvedPin.photoUrl);
  const empty = t.map.notProvided;

  return `
    <article data-testid="map-pin-info-panel" style="min-width:280px;max-width:340px;padding:0 0 8px;font-family:inherit;color:#1f2937;overflow:hidden;">
      <div style="height:132px;background:#eef3f7;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:12px 12px 8px 8px;">
        ${
          thumbnail
            ? `<img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(t.map.infoThumbnail)}" style="width:100%;height:100%;object-fit:cover;" />`
            : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#6b7280;font-size:12px;">${escapeHtml(t.map.infoThumbnail)}</div>`
        }
      </div>
      <div style="padding:12px 8px 0;">
        <div style="display:flex;align-items:flex-start;gap:8px;">
              <div style="width:12px;height:12px;border-radius:999px;background:${escapeHtml(resolvedPin.color || "#5a7ea3")};margin-top:5px;box-shadow:0 0 0 3px rgba(255,255,255,.9),0 2px 8px rgba(0,0,0,.18);"></div>
              <div style="min-width:0;flex:1;">
            <h3 style="margin:0;font-size:16px;line-height:1.35;font-weight:700;color:#111827;">${escapeHtml(resolvedPin.name)}</h3>
            <p style="margin:4px 0 0;font-size:12px;line-height:1.45;color:#4b5563;">${escapeHtml(resolvedPin.description || t.map.noDescription)}</p>
          </div>
        </div>
      </div>
      <dl style="display:grid;grid-template-columns:72px 1fr;gap:6px 8px;margin:12px 8px 0;font-size:12px;line-height:1.45;">
        <dt style="color:#6b7280;">${escapeHtml(t.map.infoAddress)}</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(resolvedPin.address || empty)}</dd>
        <dt style="color:#6b7280;">${escapeHtml(t.map.infoOpeningHours)}</dt>
        <dd style="margin:0;color:#1f2937;">${buildOpeningHoursInfoHtml(resolvedPin.openingHours, empty)}</dd>
        <dt style="color:#6b7280;">${escapeHtml(t.map.infoPhone)}</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(resolvedPin.phoneNumber || empty)}</dd>
        <dt style="color:#6b7280;">${escapeHtml(t.map.infoSource)}</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(pinSourceLabel(resolvedPin.source))}${resolvedPin.dayNumber ? ` · D${escapeHtml(resolvedPin.dayNumber)}` : ""}</dd>
      </dl>
      <a href="${escapeHtml(routeUrl)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;margin:12px 8px 0;padding:9px 12px;border-radius:10px;background:#426991;color:white;font-size:12px;font-weight:700;text-decoration:none;">
        ${escapeHtml(t.map.infoRoute)}
      </a>
      ${
        googleMapsUrl
          ? `<a href="${escapeHtml(googleMapsUrl)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;margin:8px 8px 0;padding:9px 12px;border-radius:10px;border:1px solid #cbd5e1;color:#1f2937;font-size:12px;font-weight:700;text-decoration:none;">
              ${escapeHtml(t.map.infoGoogleMaps)}
            </a>`
          : ""
      }
    </article>
  `;
}
