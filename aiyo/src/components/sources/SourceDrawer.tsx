"use client";

import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { buildSourceExternalUrl } from "@/lib/sources/externalUrl";
import type { SourceReference } from "@/lib/types/sources";
import { YouTubeSourceCard } from "@/components/sources/YouTubeSourceCard";
import { WebsiteSourceCard } from "@/components/sources/WebsiteSourceCard";
import { MapPlaceSourceCard } from "@/components/sources/MapPlaceSourceCard";
import { SourceHoverCard } from "@/components/sources/SourceHoverCard";
import { cn } from "@/lib/utils";

export type SourceDrawerProps = {
  source: SourceReference | null;
  open: boolean;
  onClose: () => void;
  className?: string;
};

function GenericSourcePanel({ source }: { source: SourceReference }) {
  const href = buildSourceExternalUrl(source);
  return (
    <div className={cn("space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4")}>
      <p className="text-sm font-semibold text-slate-900">{source.title}</p>
      <SourceHoverCard source={source} className="space-y-2" />
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          在新分頁開啟
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

export function SourceDrawer({ source, open, onClose, className }: SourceDrawerProps) {
  const href = source ? buildSourceExternalUrl(source) : undefined;
  const sheetOpen = open && Boolean(source);

  return (
    <Sheet
      open={sheetOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          "flex h-full w-full max-w-md flex-col gap-0 border-slate-200 bg-white p-0 sm:max-w-md",
          className,
        )}
      >
        {source ? (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p id="source-drawer-title" className="text-sm font-semibold leading-snug text-slate-900">
                  來源詳情
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{source.title}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                className="size-9 shrink-0 rounded-full border border-slate-200"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {source.type === "youtube" ? (
                <YouTubeSourceCard source={source} />
              ) : source.type === "website" ? (
                <WebsiteSourceCard source={source} />
              ) : source.type === "google_place" ? (
                <MapPlaceSourceCard source={source} />
              ) : (
                <GenericSourcePanel source={source} />
              )}
            </div>

            {href ? (
              <div className="border-t border-slate-100 px-4 py-3">
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-medium text-slate-900 hover:bg-slate-100"
                >
                  在新分頁開啟
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </div>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
