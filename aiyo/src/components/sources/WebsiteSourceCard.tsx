"use client";

import { ExternalLink, Globe } from "lucide-react";
import type { SourceReference } from "@/lib/types/sources";

export function WebsiteSourceCard({ source }: { source: SourceReference }) {
  const w = source.website;
  const openUrl = source.url?.trim() || w?.canonicalUrl?.trim();

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Globe className="size-4 text-sky-600" aria-hidden />
        網頁
      </div>
      <p className="text-sm font-medium text-slate-900">{source.title}</p>
      {w?.siteName ? <p className="text-xs text-slate-500">網站：{w.siteName}</p> : null}
      {w?.publishedAt ? <p className="text-xs text-slate-500">發布：{w.publishedAt}</p> : null}
      {w?.author ? <p className="text-xs text-slate-500">作者：{w.author}</p> : null}
      {source.snippet ? (
        <blockquote className="rounded-xl border border-slate-100 bg-white/90 px-3 py-2 text-xs leading-relaxed text-slate-700">
          {source.snippet}
        </blockquote>
      ) : (
        <p className="text-xs text-slate-500">無摘要。</p>
      )}
      {openUrl ? (
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 break-all text-xs font-medium text-primary hover:underline"
        >
          {openUrl}
          <ExternalLink className="size-3 shrink-0" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}
