import { enrichItineraryItemsMissingPlacePhotos } from "@/services/geocodeItineraryItems";
import { buildPinsFromLocations, reconcileTripMapState } from "@/services/mapSync";
import { apiPut } from "@/services/apiClient";
import { syncService } from "@/services/syncService";
import { recordAppliedVideoSummary } from "@/services/videoClient";
import { useMapStore } from "@/stores/useMapStore";
import { withSyncMutationSource } from "@/stores/syncMutationSource";
import { useTripStore } from "@/stores/useTripStore";
import type { LocationReference, PersistedTripPayload, TripPlanDay, Video } from "@/types";

type VideoPlaceImportResult = {
  addedItems: number;
  addedPins: number;
};

export type VideoPlaceImportOptions = {
  /** 要加入的地點名稱（與 `LocationReference.name` 一致）；若省略則加入所有已驗證地點（仍會過濾泛用美食名與重複）。 */
  selectedNames?: string[];
  /** 加入此行程日；若該日不存在會先建立空天數或落到第一天。 */
  targetDayNumber?: number;
};

const GENERIC_FOOD_NAMES = new Set([
  "火雞肉飯",
  "雞肉飯",
  "砂鍋魚頭",
  "豆花",
  "涼麵",
  "方塊酥",
  "粉圓",
  "米糕",
  "肉圓",
  "早餐",
  "午餐",
  "晚餐",
  "小吃",
  "甜點",
]);

function normalizeLocationName(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function isGenericFoodLocation(location: LocationReference) {
  const normalized = normalizeLocationName(location.name);
  return GENERIC_FOOD_NAMES.has(normalized);
}

function buildVideoSummarySnippet(video: Video, location: LocationReference) {
  const matchedSegments = (video.summarySegments || []).filter((segment) =>
    (segment.locationHints || []).some((hint) => normalizeLocationName(hint) === normalizeLocationName(location.name)),
  );
  const foods = Array.from(
    new Set(
      matchedSegments
        .flatMap((segment) => segment.foods || [])
        .map((food) => food.trim())
        .filter(Boolean),
    ),
  );
  const segmentNotes = matchedSegments
    .map((segment) => segment.summary || segment.text)
    .filter(Boolean)
    .slice(0, 2);
  return [location.description, ...segmentNotes, foods.length ? `相關美食：${foods.join("、")}` : ""]
    .filter(Boolean)
    .join("\n");
}

function isVerifiedMapLocation(location: LocationReference) {
  return (
    location.verified === true &&
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng) &&
    location.name.trim().length > 0
  );
}

function buildDraftItineraryWithTargetDay(
  itinerary: TripPlanDay[],
  targetDayNumber?: number,
): TripPlanDay[] {
  const normalizedTarget =
    typeof targetDayNumber === "number" && Number.isFinite(targetDayNumber) && targetDayNumber >= 1
      ? Math.floor(targetDayNumber)
      : null;
  const next = itinerary.map((day) => ({
    ...day,
    items: day.items.map((item) => ({ ...item })),
  }));

  if (next.length === 0) {
    next.push({
      dayNumber: 1,
      theme: "Day 1",
      summary: "尚未安排內容",
      items: [],
    });
  }

  const requiredDays = Math.max(next.length, normalizedTarget ?? 1);
  while (next.length < requiredDays) {
    const nextDayNumber = next.length + 1;
    next.push({
      dayNumber: nextDayNumber,
      theme: `Day ${nextDayNumber}`,
      summary: "尚未安排內容",
      items: [],
    });
  }

  return next.map((day, index) => ({
    ...day,
    dayNumber: index + 1,
    theme: day.theme?.trim() ? day.theme : `Day ${index + 1}`,
    items: day.items.map((item) => ({ ...item, dayNumber: index + 1 })),
  }));
}

export function getVerifiedGeocodedVideoLocations(video: Video) {
  return video.extractedLocations.filter(isVerifiedMapLocation);
}

/** 可透過「加入地圖與行程」匯入的地點（已驗證、非泛用美食名）。 */
export function getVideoImportCandidateLocations(video: Video) {
  return getVerifiedGeocodedVideoLocations(video).filter((location) => !isGenericFoodLocation(location));
}

/** 明確把影片摘要中已驗證的具名地點加入目前行程與地圖，並立即同步到後端。 */
export async function importVideoVerifiedPlacesToTrip(
  video: Video,
  options?: VideoPlaceImportOptions,
): Promise<VideoPlaceImportResult> {
  let verified = getVerifiedGeocodedVideoLocations(video).filter((location) => !isGenericFoodLocation(location));
  if (options?.selectedNames?.length) {
    const allow = new Set(options.selectedNames.map((n) => normalizeLocationName(n)));
    verified = verified.filter((loc) => allow.has(normalizeLocationName(loc.name)));
  }
  if (verified.length === 0) {
    return { addedItems: 0, addedPins: 0 };
  }

  const enrichedPhotoUpdates = await enrichItineraryItemsMissingPlacePhotos(
    verified.map((location, index) => ({
      dayNumber: 1,
      item: {
        id: `video_import_preview_${index}`,
        title: location.name,
        time: "09:00",
        type: "attraction",
        location,
      },
    })),
    useTripStore.getState().destination,
  );
  if (enrichedPhotoUpdates.length > 0) {
    const enrichedByName = new Map(
      enrichedPhotoUpdates.map((entry) => [normalizeLocationName(entry.location.name), entry.location]),
    );
    verified = verified.map((location) => {
      const enriched = enrichedByName.get(normalizeLocationName(location.name));
      return enriched ?? location;
    });
  }
  const current = useTripStore.getState().itinerary;
  const nextItinerary = buildDraftItineraryWithTargetDay(current, options?.targetDayNumber);
  const availableDayNumbers = nextItinerary.map((day) => day.dayNumber);
  const fixedTargetDay =
    options?.targetDayNumber && availableDayNumbers.includes(options.targetDayNumber)
      ? options.targetDayNumber
      : null;
  const existingNames = new Set(
    nextItinerary
      .flatMap((day) => day.items)
      .map((item) => normalizeLocationName(item.location?.name || item.title)),
  );
  const itemsToPin: Array<{ itemId: string; dayNumber: number; location: LocationReference }> = [];

  verified.forEach((location, index) => {
    const normalizedName = normalizeLocationName(location.name);
    if (existingNames.has(normalizedName)) {
      return;
    }
    existingNames.add(normalizedName);

    const itemId = `video_${video.id}_${index}`;
    const targetDayNumber =
      fixedTargetDay ?? (availableDayNumbers[index % availableDayNumbers.length] || 1);
    const inferredType = location.mentionedFoods?.length || /餐|飯|魚頭|夜市|市場|美食|店/.test(location.name)
      ? "restaurant"
      : "attraction";
    const targetDay = nextItinerary.find((day) => day.dayNumber === targetDayNumber);
    if (!targetDay) {
      return;
    }

    targetDay.items.push({
      id: itemId,
      dayNumber: targetDayNumber,
      time: `${String(9 + index * 2).padStart(2, "0")}:00`,
      title: location.name,
      type: inferredType,
      // 備註欄位保留給使用者手動補充交通或訂位資訊，不混入影片摘要段落。
      notes: location.address || location.description || "",
      sourceSnippet: buildVideoSummarySnippet(video, location),
      location,
      source: "video",
    });
    itemsToPin.push({ itemId, dayNumber: targetDayNumber, location });
  });

  if (itemsToPin.length === 0) {
    return { addedItems: 0, addedPins: 0 };
  }

  const itemMetaByLocationName = new Map(
    itemsToPin.map((entry) => [normalizeLocationName(entry.location.name), entry]),
  );
  const pins = buildPinsFromLocations(
    itemsToPin.map((entry) => entry.location),
    "video",
  ).map((pin, index) => {
    const matchedEntry = itemMetaByLocationName.get(normalizeLocationName(pin.name));
    return {
      ...pin,
      id: `video_pin_${video.id}_${index}`,
      dayNumber: matchedEntry?.dayNumber,
      linkedTripItemId: matchedEntry?.itemId,
    };
  });
  const reconciled = reconcileTripMapState(nextItinerary, [
    ...useMapStore.getState().pins,
    ...pins,
  ]);

  withSyncMutationSource("local-user-edit", () => {
    useTripStore.setState({
      itinerary: reconciled.itinerary,
      days: Math.max(1, reconciled.itinerary.length),
      lastUpdatedAt: new Date().toISOString(),
    });
    useMapStore.getState().setPins(reconciled.pins, "local-user-edit");
  });

  if (typeof window === "undefined") {
    await syncService.flushTripSyncNow({ force: true });
  } else {
    const tripState = useTripStore.getState();
    const savedTrip = await apiPut<PersistedTripPayload, PersistedTripPayload>("/api/trips/current", {
      tripId: tripState.tripId || "",
      title: tripState.title,
      destination: tripState.destination,
      days: Math.max(1, reconciled.itinerary.length),
      budget: tripState.budget,
      coverImageUrl: tripState.coverImageUrl ?? null,
      itinerary: reconciled.itinerary,
      pins: reconciled.pins,
      updatedAt: new Date().toISOString(),
    });

    useTripStore.getState().setRemoteTrip(savedTrip, tripState.budget, "server-ack");
    useMapStore.getState().setPins(savedTrip.pins, "server-ack");
    syncService.markLocalTripPayloadAsSynced();
  }

  await recordAppliedVideoSummary({
    tripId: useTripStore.getState().tripId,
    videoId: video.videoId || video.id,
    summaryId: video.videoId || video.id,
    videoUrl: video.url,
    title: video.title,
    appliedPlaces: verified.map((location) => location.name),
    appliedSegments: video.summarySegments || [],
    createdTripItems: itemsToPin.map((entry) => entry.itemId),
    summarySnapshot: {
      summary: video.summary,
      extractedLocations: verified.map((location) => location.name),
    },
  }).catch(() => undefined);
  return { addedItems: itemsToPin.length, addedPins: pins.length };
}
