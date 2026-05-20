"use client";

import Image from "next/image";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceReference } from "@/lib/types/sources";

function formatYoutubeTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m)}:${String(r).padStart(2, "0")}`;
}

export type SourceHoverCardProps = {
  source: SourceReference;
  /** 外部已解析的 loading（例如 preview API） */
  loading?: boolean;
  /** 無內容可顯示 */
  empty?: boolean;
  error?: string | null;
  className?: string;
};

export function SourceHoverCard({
  source,
  loading = false,
  empty = false,
  error = null,
  className,
}: SourceHoverCardProps) {
  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-slate-500", className)}>
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        <span>載入來源預覽中</span>
      </div>
    );
  }
  if (error) {
    return <p className={cn("text-xs text-red-600", className)}>{error}</p>;
  }
  if (empty || (!source.title && !source.snippet && !source.url)) {
    return (
      <p className={cn("text-xs text-slate-500", className)}>尚無可用摘要（請檢查來源是否完整）。</p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {source.type === "youtube" && source.youtube ? (
        <div className="flex gap-2">
          {source.thumbnailUrl ? (
            <Image
              src={source.thumbnailUrl}
              alt=""
              width={80}
              height={56}
              unoptimized
              className="h-14 w-20 rounded-md object-cover"
            />
          ) : null}
          <div className="min-w-0 text-xs">
            {source.youtube.channelTitle ? (
              <p className="text-[10px] text-slate-500">{source.youtube.channelTitle}</p>
            ) : null}
            {source.youtube.timestampLabel || source.youtube.startSeconds != null ? (
              <p className="mt-0.5 font-medium text-slate-800">
                {source.youtube.timestampLabel ||
                  (source.youtube.startSeconds != null
                    ? formatYoutubeTimestamp(source.youtube.startSeconds)
                    : "")}
              </p>
            ) : null}
            {source.youtube.transcriptText ? (
              <p className="mt-1 line-clamp-3 text-slate-600">{source.youtube.transcriptText}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {source.type === "website" && source.website ? (
        <div className="text-xs text-slate-600">
          {source.website.siteName ? <p className="font-medium text-slate-800">{source.website.siteName}</p> : null}
          {source.website.publishedAt ? (
            <p className="mt-0.5 text-[10px] text-slate-500">發布：{source.website.publishedAt}</p>
          ) : null}
          {source.website.canonicalUrl ? (
            <p className="mt-1 break-all text-[10px] text-primary">{source.website.canonicalUrl}</p>
          ) : null}
        </div>
      ) : null}

      {source.type === "google_place" && source.googlePlace ? (
        <div className="text-xs text-slate-600">
          <p className="font-medium text-slate-800">{source.googlePlace.name}</p>
          {source.googlePlace.address ? <p className="mt-0.5">{source.googlePlace.address}</p> : null}
          {source.googlePlace.rating != null ? (
            <p className="mt-1 text-[10px] text-slate-500">
              評分 {source.googlePlace.rating}
              {source.googlePlace.userRatingCount != null
                ? `（${source.googlePlace.userRatingCount} 則）`
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {source.type === "user_upload" && source.userUpload ? (
        <p className="text-xs text-slate-600">
          {source.userUpload.fileName}
          {source.userUpload.pageNumber != null ? ` · 第 ${source.userUpload.pageNumber} 頁` : ""}
          {source.userUpload.chunkIndex != null ? ` · 片段 ${source.userUpload.chunkIndex}` : ""}
        </p>
      ) : null}

      {source.snippet ? (
        <p className="line-clamp-4 text-xs leading-relaxed text-slate-600">{source.snippet}</p>
      ) : null}
    </div>
  );
}
