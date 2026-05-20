"use client";

import { ExternalLink, MapPin } from "lucide-react";
import type { SourceReference } from "@/lib/types/sources";

export function MapPlaceSourceCard({ source }: { source: SourceReference }) {
  const p = source.googlePlace;
  const mapsHref =
    p?.placeId &&
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${encodeURIComponent(p.placeId)}`;
  const ll =
    p?.lat != null && p?.lng != null ? `https://www.google.com/maps?q=${p.lat},${p.lng}` : undefined;
  const href = mapsHref || ll || source.url?.trim();

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <MapPin className="size-4 text-emerald-600" aria-hidden />
        Google 地點
      </div>
      {p ? (
        <>
          <p className="text-sm font-medium text-slate-900">{p.name}</p>
          {p.address ? <p className="text-xs text-slate-600">{p.address}</p> : null}
          {p.rating != null ? (
            <p className="text-xs text-slate-500">
              評分 {p.rating}
              {p.userRatingCount != null ? ` · ${p.userRatingCount} 則評論` : ""}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-slate-700">{source.title}</p>
      )}
      {source.snippet ? (
        <p className="text-xs leading-relaxed text-slate-600">{source.snippet}</p>
      ) : null}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          在 Google 地圖開啟
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : (
        <p className="text-xs text-slate-500">無法產生地圖連結（缺少 placeId / 座標）。</p>
      )}
    </div>
  );
}
