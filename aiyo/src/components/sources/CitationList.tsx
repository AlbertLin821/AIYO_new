"use client";

import { useMemo, useState } from "react";
import { SourceBadge } from "@/components/sources/SourceBadge";
import { cn } from "@/lib/utils";
import type { SourceReference } from "@/lib/types/sources";

export type CitationListProps = {
  sources: SourceReference[];
  /** 預設顯示數量，超過顯示「+N」 */
  maxVisible?: number;
  className?: string;
  /** 傳入後每個來源徽章可開啟側邊詳情 */
  onOpenSourceDetail?: (source: SourceReference) => void;
};

function dedupeSources(sources: SourceReference[]): SourceReference[] {
  const map = new Map<string, SourceReference>();
  for (const s of sources) {
    if (!s?.id) {
      continue;
    }
    if (!map.has(s.id)) {
      map.set(s.id, s);
    }
  }
  return [...map.values()];
}

export function CitationList({
  sources,
  maxVisible = 6,
  className,
  onOpenSourceDetail,
}: CitationListProps) {
  const [expanded, setExpanded] = useState(false);
  const unique = useMemo(() => dedupeSources(sources || []), [sources]);

  if (!unique.length) {
    return null;
  }

  const limit = expanded ? unique.length : Math.min(maxVisible, unique.length);
  const visible = unique.slice(0, limit);
  const overflow = unique.length - visible.length;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} data-testid="citation-list">
      <span className="w-full text-[10px] font-medium uppercase tracking-wide text-slate-400">
        參考來源
      </span>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((source) => (
          <SourceBadge
            key={source.id}
            source={source}
            onOpenDetail={onOpenSourceDetail}
          />
        ))}
        {!expanded && overflow > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center rounded-full border border-dashed border-slate-300 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
          >
            +{overflow} 更多
          </button>
        ) : null}
      </div>
    </div>
  );
}
