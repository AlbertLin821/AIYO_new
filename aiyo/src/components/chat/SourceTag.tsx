"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Link2, Loader2 } from "lucide-react";
import { CitationList } from "@/components/sources/CitationList";
import { chatSourcesRecordToReferences } from "@/lib/sources/chatSourceAdapter";
import { fetchSourcePreview } from "@/services/aiClient";
import { cn } from "@/lib/utils";
import type { SourceReference } from "@/lib/types/sources";
import type { ChatSource } from "@/types";

function buildSourceBadgeLabel(sourceId: string, source?: ChatSource): string {
  const suffix = sourceId.match(/_(\d+)$/)?.[1];
  const indexLabel = suffix ? ` ${String(Number(suffix))}` : "";
  if (!source) {
    return `來源${indexLabel}`;
  }
  const labelByType: Record<ChatSource["type"], string> = {
    web: "網頁",
    youtube: "YouTube",
    weather: "天氣",
    official: "官方",
    other: "來源",
  };
  return `${labelByType[source.type] || "來源"}${indexLabel}`;
}

function SourcePreviewCard({
  source,
  loading,
  error,
}: {
  source: ChatSource | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="absolute left-0 top-full z-20 mt-2 w-80 rounded-xl border border-border-light bg-white p-3 shadow-soft-lg">
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          <span>載入來源預覽中</span>
        </div>
      ) : error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : source ? (
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            {source.thumbnail ? (
              <Image
                src={source.thumbnail}
                alt={source.title}
                width={80}
                height={56}
                unoptimized
                className="h-14 w-20 rounded-md object-cover"
              />
            ) : source.favicon ? (
              <Image
                src={source.favicon}
                alt={source.domain}
                width={32}
                height={32}
                unoptimized
                className="h-8 w-8 rounded-md"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Link2 className="size-4" aria-hidden />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-xs font-semibold leading-relaxed text-foreground">{source.title}</p>
              <p className="mt-1 text-[11px] text-muted">{source.domain || source.provider}</p>
            </div>
          </div>
          <p className="line-clamp-3 text-xs leading-relaxed text-muted">
            {source.preview_text || source.snippet}
          </p>
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
            <span>{source.reliability === "high" ? "高可信度" : source.reliability === "medium" ? "中可信度" : "低可信度"}</span>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <span>開啟來源</span>
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">沒有可用的來源預覽。</p>
      )}
    </div>
  );
}

export function SourceTag({
  sourceId,
  source,
}: {
  sourceId: string;
  source?: ChatSource;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ChatSource | null>(source || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(Boolean(source));

  useEffect(() => {
    if (!open || loadedRef.current) {
      return;
    }
    let cancelled = false;
    const loadPreview = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchSourcePreview(sourceId);
        if (cancelled) {
          return;
        }
        loadedRef.current = true;
        setPreview(result);
      } catch (fetchError) {
        if (cancelled) {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : "來源預覽載入失敗");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [open, sourceId]);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border-light bg-white px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:border-primary/30 hover:text-primary",
        )}
      >
        <Link2 className="size-3" aria-hidden />
        <span>{buildSourceBadgeLabel(sourceId, source)}</span>
      </button>
      {open ? <SourcePreviewCard source={preview} loading={loading} error={error} /> : null}
    </div>
  );
}

export function CitationGroup({
  citations,
  sources,
  onOpenGroundedDetail,
}: {
  citations?: string[];
  sources?: Record<string, ChatSource>;
  onOpenGroundedDetail?: (source: SourceReference) => void;
}) {
  const validCitations = (citations || []).filter((citation) => Boolean(sources?.[citation]));

  if (!validCitations.length) {
    return null;
  }

  if (onOpenGroundedDetail) {
    const refs = chatSourcesRecordToReferences(validCitations, sources);
    if (!refs.length) {
      return null;
    }
    return (
      <div className="mt-1">
        <CitationList
          sources={refs}
          maxVisible={8}
          onOpenSourceDetail={onOpenGroundedDetail}
        />
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {validCitations.map((citation) => (
        <SourceTag key={citation} sourceId={citation} source={sources?.[citation]} />
      ))}
    </div>
  );
}
