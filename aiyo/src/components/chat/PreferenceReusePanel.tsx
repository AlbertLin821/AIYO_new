"use client";

import { useMemo, useState } from "react";
import {
  buildPreferenceDetailRows,
  buildPreferenceOverrideMessage,
  formatBudgetLevelLabel,
  formatPaceLabel,
} from "@/lib/personalization/preferenceDisplay";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import type { TravelAgentKnownPreferences, TravelAgentPreferenceConfirmation } from "@/types";

type EditablePreferences = TravelAgentKnownPreferences;

export default function PreferenceReusePanel({
  confirmation,
  disabled,
  currentDestination,
  currentDays,
  onAccept,
  onDecline,
  onEditSubmit,
  className,
  variant = "rail",
}: {
  confirmation: TravelAgentPreferenceConfirmation;
  disabled?: boolean;
  currentDestination?: string;
  currentDays?: number;
  onAccept: () => void;
  onDecline: () => void;
  onEditSubmit: (message: string, displayMessage: string) => void;
  className?: string;
  variant?: "rail" | "inline";
}) {
  const [mode, setMode] = useState<"summary" | "edit">("summary");
  const [draft, setDraft] = useState<EditablePreferences>(() => ({ ...confirmation.preferences }));

  const detailRows = useMemo(
    () =>
      buildPreferenceDetailRows(confirmation.preferences, {
        currentDestination,
        currentDays,
      }),
    [confirmation.preferences, currentDestination, currentDays],
  );

  return (
    <div
      data-testid="preference-reuse-panel"
      className={cn(
        variant === "inline"
          ? "chat-assistant-surface rounded-2xl px-4 py-4 text-slate-800"
          : "relative z-10 border-t border-primary/15 bg-white/90 px-5 py-5 backdrop-blur-sm",
        className,
      )}
    >
      <p className="text-sm font-semibold text-slate-900">{t.chat.preferenceReuseTitle}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
        {confirmation.prompt || t.chat.preferenceReuseDescription}
      </p>
      {confirmation.summary ? (
        <p className="mt-2 text-sm font-medium text-primary">{confirmation.summary}</p>
      ) : null}

      {mode === "summary" ? (
        <>
          {detailRows.length ? (
            <dl className="mt-4 grid gap-2 sm:grid-cols-2">
              {detailRows.map((row) => (
                <div key={row.label} className="chat-assistant-surface-inset rounded-2xl border px-3 py-2">
                  <dt className="text-xs font-medium text-slate-500">{row.label}</dt>
                  <dd className="mt-0.5 text-sm text-slate-800">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="preference-reuse-accept"
              onClick={onAccept}
              disabled={disabled}
              className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t.chat.preferenceReuseAccept}
            </button>
            <button
              type="button"
              data-testid="preference-reuse-edit"
              onClick={() => setMode("edit")}
              disabled={disabled}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t.chat.preferenceReuseEdit}
            </button>
            <button
              type="button"
              data-testid="preference-reuse-decline"
              onClick={onDecline}
              disabled={disabled}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t.chat.preferenceReuseDecline}
            </button>
          </div>
        </>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">{t.chat.preferenceFieldBudgetLevel}</span>
            <select
              value={draft.budgetLevel || ""}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  budgetLevel: event.target.value || undefined,
                }))
              }
              className="rounded-2xl border border-slate-200 px-3 py-2"
            >
              <option value="">未設定</option>
              <option value="low">低預算</option>
              <option value="medium">中等預算</option>
              <option value="high">高預算</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">{t.chat.preferenceFieldPace}</span>
            <select
              value={draft.pace || ""}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  pace: event.target.value || undefined,
                }))
              }
              className="rounded-2xl border border-slate-200 px-3 py-2"
            >
              <option value="">未設定</option>
              <option value="relaxed">輕鬆慢遊</option>
              <option value="balanced">平均節奏</option>
              <option value="intensive">行程緊湊</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">{t.chat.preferenceFieldTravelStyle}</span>
            <input
              value={draft.travelStyle?.join("、") || ""}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  travelStyle: event.target.value
                    .split(/[、,，]/)
                    .map((item) => item.trim())
                    .filter(Boolean),
                }))
              }
              placeholder="例如：美食、購物"
              className="rounded-2xl border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">{t.chat.preferenceFieldTransport}</span>
            <input
              value={draft.transportPreference || ""}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, transportPreference: event.target.value || undefined }))
              }
              placeholder="例如：地鐵與步行"
              className="rounded-2xl border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">{t.chat.preferenceFieldAccommodation}</span>
            <input
              value={draft.accommodationPreference || ""}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  accommodationPreference: event.target.value || undefined,
                }))
              }
              placeholder="例如：市區飯店"
              className="rounded-2xl border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">{t.chat.preferenceFieldCompanion}</span>
            <input
              value={draft.companionType || ""}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, companionType: event.target.value || undefined }))
              }
              placeholder="例如：情侶、家庭"
              className="rounded-2xl border border-slate-200 px-3 py-2"
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                const message = buildPreferenceOverrideMessage(draft);
                onEditSubmit(message, t.chat.preferenceReuseEditSubmitDisplay);
              }}
              className={cn(
                "rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {t.chat.preferenceReuseEditSubmit}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setMode("summary")}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t.chat.preferenceReuseBack}
            </button>
          </div>
          {(draft.budgetLevel || draft.pace) && (
            <p className="text-xs text-slate-500 sm:col-span-2">
              預覽：
              {[formatBudgetLevelLabel(draft.budgetLevel), formatPaceLabel(draft.pace)]
                .filter(Boolean)
                .join("、")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
