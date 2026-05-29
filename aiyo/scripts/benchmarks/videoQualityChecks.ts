import type { VideoSummaryResult } from "@/types";
import type { AnchorPoi, CountryBounds, GlobalVideoDestination } from "./global-video-destinations";

/** 常見簡體字巡檢（非完整 Unicode，僅供報告用）。 */
const COMMON_SIMPLIFIED = /(?:这个|适于|台湾(?![\u7063\u706f])|视频|软件|链接)/;

export function containsSimplifiedCue(text: string): boolean {
  return COMMON_SIMPLIFIED.test(text);
}

export function looksLikeTranscriptDump(text: string): boolean {
  const t = text.trim();
  if (t.length < 60) {
    return false;
  }
  const fillers = /(然後|等一下|這邊|那邊|就是我們|我們現在)/g;
  const hits = t.match(fillers);
  return hits !== null && hits.length >= 4;
}

export function segmentsChronological(segments: Array<{ startSeconds?: number }>): boolean {
  const ss = segments.map((s) => s.startSeconds ?? 0);
  for (let i = 1; i < ss.length; i++) {
    if (ss[i] < ss[i - 1]) {
      return false;
    }
  }
  return true;
}

export function normalizeNameToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/臺/g, "台");
}

function namesFuzzyMatch(a: string, b: string): boolean {
  const na = normalizeNameToken(a);
  const nb = normalizeNameToken(b);
  if (!na || !nb) {
    return false;
  }
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function findGenericLeaks(
  locationNames: string[],
  genericRejectHints: string[],
): string[] {
  const leaked: string[] = [];
  for (const hint of genericRejectHints) {
    const h = hint.trim();
    if (!h) {
      continue;
    }
    for (const name of locationNames) {
      const n = name.trim();
      if (!n) {
        continue;
      }
      // 僅精確比對，避免「東京晴空塔」因包含「東京」被誤判
      if (n === h || normalizeNameToken(n) === normalizeNameToken(h)) {
        leaked.push(h);
        break;
      }
    }
  }
  return [...new Set(leaked)];
}

export function isWithinBounds(
  lat: number,
  lng: number,
  bounds: CountryBounds,
): boolean {
  return (
    lat >= bounds.latMin &&
    lat <= bounds.latMax &&
    lng >= bounds.lngMin &&
    lng <= bounds.lngMax
  );
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type AnchorMiss = {
  locationName: string;
  anchorName: string;
  distanceKm: number;
  maxKm: number;
};

export function checkAnchorDistance(
  locations: Array<{ name: string; lat?: number; lng?: number }>,
  anchors: AnchorPoi[] | undefined,
): AnchorMiss[] {
  if (!anchors?.length) {
    return [];
  }
  const misses: AnchorMiss[] = [];
  for (const loc of locations) {
    if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
      continue;
    }
    for (const anchor of anchors) {
      if (!namesFuzzyMatch(loc.name, anchor.name)) {
        continue;
      }
      const distanceKm = haversineKm(loc.lat as number, loc.lng as number, anchor.lat, anchor.lng);
      if (distanceKm > anchor.maxKm) {
        misses.push({
          locationName: loc.name,
          anchorName: anchor.name,
          distanceKm: Math.round(distanceKm * 10) / 10,
          maxKm: anchor.maxKm,
        });
      }
    }
  }
  return misses;
}

export type HintsOrphanStats = {
  totalSegmentsWithHints: number;
  orphanSegments: number;
  orphanRatio: number;
};

export function computeHintsOrphanStats(
  segments: Array<{ locationHints?: string[] }>,
  extractedLocationNames: string[],
): HintsOrphanStats {
  let totalSegmentsWithHints = 0;
  let orphanSegments = 0;

  for (const segment of segments) {
    const hints = (segment.locationHints || []).filter((h) => h.trim().length > 0);
    if (hints.length === 0) {
      continue;
    }
    totalSegmentsWithHints += 1;
    const matched = hints.some((hint) =>
      extractedLocationNames.some((name) => namesFuzzyMatch(hint, name)),
    );
    if (!matched) {
      orphanSegments += 1;
    }
  }

  return {
    totalSegmentsWithHints,
    orphanSegments,
    orphanRatio: totalSegmentsWithHints === 0 ? 0 : orphanSegments / totalSegmentsWithHints,
  };
}

export type VideoQualityReport = {
  autoPass: boolean;
  errors: string[];
  warnings: string[];
  checks: {
    chronological: boolean;
    genericLeaks: string[];
    pinsOutOfBounds: string[];
    hintsOrphan: HintsOrphanStats;
    verifiedRatio: number | null;
    poiCount: number;
    simplifiedSegmentCount: number;
    transcriptDumpSegmentCount: number;
    anchorMisses: AnchorMiss[];
    noTranscript: boolean;
  };
};

const HINTS_ORPHAN_FAIL_RATIO = 0.5;
const MIN_POI_WARNING = 2;
const MIN_VERIFIED_RATIO_WARNING = 0.3;

export function evaluateVideoQuality(
  result: VideoSummaryResult,
  destination: GlobalVideoDestination,
): VideoQualityReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const segments = result.segments || [];
  const locations = result.video.extractedLocations || [];
  const locationNames = result.extractedLocations;

  const noTranscript =
    result.transcriptSource === "none" ||
    result.transcriptSource === "description-fallback" ||
    Boolean(result.summaryUnavailable);

  const chronological = segmentsChronological(segments);
  if (!chronological && segments.length > 1) {
    errors.push("segments_not_chronological");
  }

  const genericLeaks = findGenericLeaks(locationNames, destination.genericRejectHints);
  if (genericLeaks.length > 0) {
    errors.push("generic_location_leak");
  }

  const pinsOutOfBounds: string[] = [];
  for (const loc of locations) {
    if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
      if (locationNames.includes(loc.name)) {
        errors.push(`missing_coordinates:${loc.name}`);
      }
      continue;
    }
    if (!isWithinBounds(loc.lat as number, loc.lng as number, destination.expectedCountryBounds)) {
      pinsOutOfBounds.push(loc.name);
    }
  }
  if (pinsOutOfBounds.length > 0) {
    errors.push("pins_out_of_bounds");
  }

  const hintsOrphan = computeHintsOrphanStats(segments, locationNames);
  if (
    hintsOrphan.totalSegmentsWithHints > 0 &&
    hintsOrphan.orphanRatio > HINTS_ORPHAN_FAIL_RATIO
  ) {
    errors.push("hints_orphan_ratio_high");
  }

  const withCoords = locations.filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng));
  const verifiedCount = withCoords.filter((l) => l.verified === true).length;
  const verifiedRatio = withCoords.length > 0 ? verifiedCount / withCoords.length : null;
  if (verifiedRatio !== null && verifiedRatio < MIN_VERIFIED_RATIO_WARNING && withCoords.length >= 2) {
    warnings.push("low_verified_ratio");
  }

  const poiCount = locationNames.length;
  if (!noTranscript && poiCount < MIN_POI_WARNING) {
    warnings.push("few_pois");
  }

  let simplifiedSegmentCount = 0;
  let transcriptDumpSegmentCount = 0;
  for (const seg of segments) {
    if (containsSimplifiedCue(seg.text || "") || containsSimplifiedCue(seg.title || "")) {
      simplifiedSegmentCount += 1;
    }
    if (looksLikeTranscriptDump(seg.text || "")) {
      transcriptDumpSegmentCount += 1;
    }
  }
  if (simplifiedSegmentCount > 0) {
    warnings.push("simplified_chinese_in_segments");
  }
  if (transcriptDumpSegmentCount > 0) {
    warnings.push("transcript_dump_segments");
  }

  const anchorMisses = checkAnchorDistance(
    locations.map((l) => ({ name: l.name, lat: l.lat, lng: l.lng })),
    destination.anchorPois,
  );
  if (anchorMisses.length > 0) {
    warnings.push("anchor_distance_miss");
  }

  if (noTranscript) {
    warnings.push("no_transcript_or_fallback");
  }

  const autoPass = errors.length === 0;

  return {
    autoPass,
    errors,
    warnings,
    checks: {
      chronological,
      genericLeaks,
      pinsOutOfBounds,
      hintsOrphan,
      verifiedRatio,
      poiCount,
      simplifiedSegmentCount,
      transcriptDumpSegmentCount,
      anchorMisses,
      noTranscript,
    },
  };
}
