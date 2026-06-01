"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ExternalLink, Globe, MapPin, PlayCircle, Upload } from "lucide-react";
import { buildSourceExternalUrl } from "@/lib/sources/externalUrl";
import { cn } from "@/lib/utils";
import type { SourceReference } from "@/lib/types/sources";
import { SourceHoverCard } from "@/components/sources/SourceHoverCard";

function formatYoutubeTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m)}:${String(r).padStart(2, "0")}`;
}

export function buildSourceBadgeLabel(source: SourceReference): string {
  const safeTitle = source.title?.trim() || "未命名來源";
  switch (source.type) {
    case "youtube": {
      const yt = source.youtube;
      const ts =
        yt?.timestampLabel ||
        (typeof yt?.startSeconds === "number" ? formatYoutubeTimestamp(yt.startSeconds) : null);
      return ts ? `YouTube ${ts}` : `YouTube · ${safeTitle.slice(0, 24)}`;
    }
    case "website": {
      const site = source.website?.siteName?.trim();
      return site ? `${site}` : "網頁";
    }
    case "google_place":
      return source.googlePlace?.name?.trim() || "Google Maps";
    case "user_upload": {
      const f = source.userUpload?.fileName?.trim() || "檔案";
      const p = source.userUpload?.pageNumber;
      return p != null ? `${f} p.${p}` : f;
    }
    case "system":
      return "系統";
    default:
      return safeTitle.slice(0, 28);
  }
}

function SourceTypeIcon({ type }: { type: SourceReference["type"] }) {
  const common = "size-3.5 shrink-0";
  switch (type) {
    case "youtube":
      return <PlayCircle className={cn(common, "text-red-600")} aria-hidden />;
    case "website":
      return <Globe className={cn(common, "text-sky-600")} aria-hidden />;
    case "google_place":
      return <MapPin className={cn(common, "text-emerald-600")} aria-hidden />;
    case "user_upload":
      return <Upload className={cn(common, "text-amber-700")} aria-hidden />;
    default:
      return <Globe className={cn(common, "text-slate-500")} aria-hidden />;
  }
}

export type SourceBadgeProps = {
  source: SourceReference;
  className?: string;
  /** 開啟側邊來源詳情（例如 SourceDrawer） */
  onOpenDetail?: (source: SourceReference) => void;
};

export function SourceBadge({ source, className, onOpenDetail }: SourceBadgeProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const label = buildSourceBadgeLabel(source);
  const href = buildSourceExternalUrl(source);
  const hoverId = useId();

  const clearHoverTimer = () => {
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  };

  const scheduleClose = () => {
    clearHoverTimer();
    hoverCloseTimer.current = setTimeout(() => setOpen(false), 160);
  };

  useEffect(() => {
    return () => clearHoverTimer();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const openLink = useCallback(() => {
    if (href) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }, [href]);

  const safeTitle = source.title?.trim() || "來源";

  return (
    <div
      ref={rootRef}
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => {
        clearHoverTimer();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-left text-[10px] font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900",
          !source.title && !source.type ? "border-amber-200 bg-amber-50 text-amber-900" : "",
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={hoverId}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (!rootRef.current?.contains(e.relatedTarget)) {
            setOpen(false);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && href) {
            e.preventDefault();
            openLink();
          }
        }}
      >
        <SourceTypeIcon type={source.type} />
        <span className="truncate">{label}</span>
        {href ? <ExternalLink className="size-3 shrink-0 text-slate-400" aria-hidden /> : null}
      </button>
      {open ? (
        <div
          id={hoverId}
          role="dialog"
          aria-label={safeTitle}
          className="absolute left-0 top-full z-30 mt-2 w-80 max-w-[85vw] rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
          onMouseEnter={clearHoverTimer}
          onMouseLeave={scheduleClose}
        >
          <p className="text-xs font-semibold leading-snug text-slate-900">{safeTitle}</p>
          <div className="mt-2">
            <SourceHoverCard source={source} />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {onOpenDetail ? (
              <button
                type="button"
                onClick={() => {
                  onOpenDetail(source);
                  setOpen(false);
                }}
                className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-slate-900 bg-slate-900 py-1.5 text-[11px] font-medium text-white hover:bg-slate-800"
              >
                側邊檢視詳情
              </button>
            ) : null}
            {href ? (
              <button
                type="button"
                onClick={openLink}
                className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-[11px] font-medium text-slate-800 hover:bg-slate-100"
              >
                在新分頁開啟
                <ExternalLink className="size-3" aria-hidden />
              </button>
            ) : (
              <p className="text-center text-[10px] text-slate-400">暫無可用連結</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
