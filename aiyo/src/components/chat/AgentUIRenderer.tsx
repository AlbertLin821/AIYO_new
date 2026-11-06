"use client";

import { agentUISchema } from "@/lib/agentUI/schema";

export default function AgentUIRenderer({ ui, busy, onAction }: { ui: unknown; busy: boolean; onAction: (actionId: string, value?: string) => void }) {
  const parsed = agentUISchema.safeParse(ui);
  if (!parsed.success) return null;
  return <div className="mt-3 space-y-2" data-testid="agent-ui">
    {parsed.data.components.map((component) => {
      if (component.kind === "itinerary_diff") return <div key={component.actionId} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">
        <span className="mr-2 font-medium">{component.props.summary}</span>
        {component.props.before && <span className="text-slate-500">{component.props.before}</span>}
        {component.props.before && component.props.after && <span aria-hidden="true" className="px-2">→</span>}
        {component.props.after && <span>{component.props.after}</span>}
      </div>;
      if (component.kind === "confirm_button") return <button key={component.actionId} type="button" disabled={busy} onClick={() => onAction(component.actionId)} className="min-h-11 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">{busy ? "套用中…" : component.props.label}</button>;
      if (component.kind === "place_card") return <article key={component.actionId} className="rounded-xl border border-slate-200 p-3 text-sm"><h3 className="font-medium">{component.props.title}</h3><p>{component.props.category || "地點"} · {component.props.checkedAt ? "已查核" : "資料待確認"}</p>{component.props.sourceUrl && <a href={component.props.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">查看來源</a>}</article>;
      if (component.kind === "map_focus") return <button key={component.actionId} type="button" disabled={busy} onClick={() => onAction(component.actionId)} className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm">{component.props.label}</button>;
      if (component.kind === "choice") return <fieldset key={component.actionId} className="rounded-xl border border-slate-200 p-3"><legend className="text-sm font-medium">{component.props.label}</legend>{component.props.options.map((option) => <button key={option} type="button" disabled={busy} onClick={() => onAction(component.actionId, option)} className="m-1 min-h-11 rounded-lg border border-slate-300 px-3 text-sm">{option}</button>)}</fieldset>;
      if (component.kind === "date_time") return <label key={component.actionId} className="block text-sm">{component.props.label}<input type="time" defaultValue={component.props.time} disabled={busy} onChange={(event) => onAction(component.actionId, event.target.value)} className="ml-2 min-h-11 rounded-lg border border-slate-300 px-2" /></label>;
      return <form key={component.actionId} onSubmit={(event) => { event.preventDefault(); const value = String(new FormData(event.currentTarget).get("query") || "").trim(); if (value) onAction(component.actionId, value); }} className="flex flex-wrap items-end gap-2 text-sm"><label className="flex-1">{component.props.label}<input name="query" type="text" defaultValue={component.props.value} placeholder={component.props.placeholder} disabled={busy} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2" /></label><button type="submit" disabled={busy} className="min-h-11 rounded-lg border border-slate-300 px-3 font-medium disabled:opacity-50">查證並替換</button></form>;
    })}
  </div>;
}
