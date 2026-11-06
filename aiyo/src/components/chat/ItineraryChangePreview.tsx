"use client";

import type { AgentPreviewDto } from "@/services/itineraryClient";
import { agentUISchema } from "@/lib/agentUI/schema";
import AgentUIRenderer from "./AgentUIRenderer";

type Props = {
  preview: AgentPreviewDto;
  busy: boolean;
  onApply: () => void;
  onTimeChange: (operationIndex: number, time: string) => void;
  onPlaceChange: (operationIndex: number, query: string) => void;
  onCancel: () => void;
};

const actionLabels: Record<string, string> = {
  add_item: "加入", remove_item: "移除", replace_item: "替換", move_item: "移動",
};

export default function ItineraryChangePreview({ preview, busy, onApply, onTimeChange, onPlaceChange, onCancel }: Props) {
  const hasValidUI = agentUISchema.safeParse(preview.ui).success;
  return (
    <section data-testid="agent-change-preview" aria-label="行程修改預覽" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" role="region">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-500">修改預覽 · 尚未套用</p>
          <h2 className="mt-1 text-base font-semibold text-slate-900">{preview.summary || "檢查行程修改"}</h2>
        </div>
        <p className="text-xs text-slate-500">{preview.changes.length} 項變更</p>
      </div>
      {hasValidUI ? <AgentUIRenderer ui={preview.ui} busy={busy} onAction={(actionId, value) => {
        if (actionId === "apply_preview") onApply();
        else if (/^time_\d+$/.test(actionId) && value) onTimeChange(Number(actionId.slice(5)), value);
        else if (/^place_\d+$/.test(actionId) && value) onPlaceChange(Number(actionId.slice(6)), value);
      }} /> : <ol className="mt-3 space-y-2">
        {preview.changes.map((change, index) => (
          <li key={`${change.itemId}-${index}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">
            <span className="mr-2 font-medium">{actionLabels[change.type] || "修改"}</span>
            {change.before && <span className="text-slate-500">{change.before.dayNumber ? `第 ${change.before.dayNumber} 天 · ` : ""}{change.before.time} {change.before.title}</span>}
            {change.before && change.after && <span aria-hidden="true" className="px-2">→</span>}
            {change.after && <span>{change.after.dayNumber ? `第 ${change.after.dayNumber} 天 · ` : ""}{change.after.time} {change.after.title}</span>}
          </li>
        ))}
      </ol>}
      {preview.warnings.length > 0 && (
        <div role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {preview.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {!hasValidUI && <button type="button" onClick={onApply} disabled={busy} className="min-h-11 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {busy ? "套用中…" : "確認套用"}
        </button>}
        <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50">取消</button>
      </div>
    </section>
  );
}
