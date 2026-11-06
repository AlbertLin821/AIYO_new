"use client";

import { useState } from "react";
import { syncService } from "@/services/syncService";
import { useCollabStore } from "@/stores/useCollabStore";
import { useTripStore } from "@/stores/useTripStore";
import { useToastStore } from "@/stores/useToastStore";

export default function TripRevisionConflictNotice() {
  const conflict = useCollabStore((state) => state.remoteRevisionConflict);
  const tripId = useTripStore((state) => state.tripId);
  const [busy, setBusy] = useState(false);
  if (!conflict || conflict.tripId !== tripId) return null;

  async function reloadLatest() {
    if (!window.confirm("載入最新行程會放棄這個畫面中尚未儲存的修改。確定繼續？")) return;
    setBusy(true);
    try {
      const snapshot = await syncService.loadBootstrap();
      if (snapshot.trip?.tripId !== conflict?.tripId) throw new Error("目前綁定的行程已變更。");
      syncService.applyBootstrap(snapshot, { source: "bootstrap", forceTrip: true });
      useCollabStore.getState().setRemoteRevisionConflict(null);
    } catch (error) {
      useToastStore.getState().pushToast({ variant: "error", title: "無法載入最新行程", description: error instanceof Error ? error.message : "請稍後再試。" });
    } finally {
      setBusy(false);
    }
  }

  return <div data-testid="trip-revision-conflict" role="alert" className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
    <span>其他協作者已更新這份行程。你的未儲存修改仍保留在此畫面；版本 {conflict.revision} 可重新載入。</span>
    <button type="button" disabled={busy} onClick={() => void reloadLatest()} className="min-h-11 rounded-lg border border-amber-700 px-3 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-50">{busy ? "載入中…" : "載入最新版本"}</button>
  </div>;
}
