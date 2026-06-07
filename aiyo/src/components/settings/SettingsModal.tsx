"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Globe,
  Heart,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { zhTW as t } from "@/locales/zh-TW";
import {
  clearPersonalizationData,
  deleteAiMemory,
  deleteMemory,
  listMemories,
  resetTravelPreferences,
  updateMemory,
} from "@/services/aiClient";
import { syncService } from "@/services/syncService";
import { useProfileStore } from "@/stores/useProfileStore";
import { useToastStore } from "@/stores/useToastStore";
import { useUIStore } from "@/stores/useUIStore";
import type { MemoryRecord, User } from "@/types";

const paceOptions: { value: User["travelPace"]; label: string; desc: string }[] = [
  { value: "relaxed", label: t.profile.paceRelaxed, desc: t.profile.paceRelaxedDesc },
  { value: "moderate", label: t.profile.paceModerate, desc: t.profile.paceModerateDesc },
  { value: "intensive", label: t.profile.paceIntensive, desc: t.profile.paceIntensiveDesc },
];

const preferenceOptions = [
  { value: "food", label: t.profile.prefFood },
  { value: "coffee", label: t.profile.prefCoffee },
  { value: "night view", label: t.profile.prefNight },
  { value: "shopping", label: t.profile.prefShopping },
  { value: "museum", label: t.profile.prefMuseum },
  { value: "architecture", label: t.profile.prefArchitecture },
  { value: "parks", label: t.profile.prefParks },
  { value: "local neighborhoods", label: t.profile.prefNeighborhoods },
];

function normalizePreferredTransport(raw: string): string {
  const u = raw.trim();
  if (["Driving", "Transit", "Walking", "Bicycling"].includes(u)) return u;
  if (/walk/i.test(u)) return "Walking";
  if (/bike|bicycle/i.test(u)) return "Bicycling";
  if (/taxi|car|drive/i.test(u)) return "Driving";
  return "Transit";
}

const transportOptions = [
  { value: "Driving", label: t.profile.transportDriving },
  { value: "Transit", label: t.profile.transportTransit },
  { value: "Walking", label: t.profile.transportWalking },
  { value: "Bicycling", label: t.profile.transportBicycling },
];

export default function SettingsModal() {
  const open = useUIStore((s) => s.settingsModalOpen);
  const close = useUIStore((s) => s.setSettingsModalOpen);
  const store = useProfileStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const [pace, setPace] = useState<User["travelPace"]>(store.travelPace);
  const [preferences, setPreferences] = useState<string[]>(store.travelPreferences);
  const [interests, setInterests] = useState<string[]>(store.interests);
  const [transport, setTransport] = useState(() => normalizePreferredTransport(store.preferredTransport));
  const [customInterest, setCustomInterest] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(true);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryText, setEditingMemoryText] = useState("");
  const [savingMemoryId, setSavingMemoryId] = useState<string | null>(null);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<"preferences" | "memory" | "all" | null>(null);

  const loadMemories = useCallback(async () => {
    setMemoriesLoading(true);
    try {
      const rows = await listMemories();
      setMemories(
        [...rows].sort((a, b) =>
          (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || ""),
        ),
      );
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.profile.memoryLoadFailed,
        description: error instanceof Error ? error.message : t.api.getFailed,
      });
    } finally {
      setMemoriesLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    if (!open) return;
    setPace(store.travelPace);
    setPreferences(store.travelPreferences);
    setInterests(store.interests);
    setTransport(normalizePreferredTransport(store.preferredTransport));
    setCustomInterest("");
    setShowCustomInput(false);
    setSaved(false);
    void loadMemories();
  }, [open, store.travelPace, store.travelPreferences, store.interests, store.preferredTransport, loadMemories]);

  function togglePreference(pref: string) {
    setPreferences((c) => (c.includes(pref) ? c.filter((i) => i !== pref) : [...c, pref]));
    setInterests((c) => (c.includes(pref) ? c.filter((i) => i !== pref) : [...c, pref]));
  }

  function addCustomInterest() {
    const trimmed = customInterest.trim();
    if (!trimmed) return;
    if (!preferences.includes(trimmed)) {
      setPreferences((c) => [...c, trimmed]);
      setInterests((c) => [...c, trimmed]);
    }
    setCustomInterest("");
    setShowCustomInput(false);
  }

  async function handleSave() {
    setSaving(true);
    const updates = { travelPace: pace, travelPreferences: preferences, interests, preferredTransport: transport };
    store.updateProfile(updates);
    try {
      const persisted = await syncService.saveProfile(updates);
      store.updateProfile(persisted);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      pushToast({ variant: "success", title: t.profile.syncedTitle, description: t.profile.syncedDesc });
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.profile.syncFailedTitle,
        description: error instanceof Error ? error.message : t.profile.syncFailedDesc,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMemory(memoryId: string) {
    if (!editingMemoryText.trim()) return;
    setSavingMemoryId(memoryId);
    try {
      const updated = await updateMemory(memoryId, editingMemoryText.trim());
      setMemories((c) => c.map((m) => (m.id === updated.id ? updated : m)));
      setEditingMemoryId(null);
      setEditingMemoryText("");
      pushToast({ variant: "success", title: t.profile.memoryUpdated, description: t.profile.memoryUpdatedDesc });
    } catch (error) {
      pushToast({ variant: "error", title: t.profile.memoryUpdateFailed, description: error instanceof Error ? error.message : t.api.putFailed });
    } finally {
      setSavingMemoryId(null);
    }
  }

  async function handleDeleteMemory(memoryId: string) {
    setDeletingMemoryId(memoryId);
    try {
      await deleteMemory(memoryId);
      setMemories((c) => c.filter((m) => m.id !== memoryId));
      if (editingMemoryId === memoryId) {
        setEditingMemoryId(null);
        setEditingMemoryText("");
      }
      pushToast({ variant: "success", title: t.profile.memoryDeleted, description: t.profile.memoryDeletedDesc });
    } catch (error) {
      pushToast({ variant: "error", title: t.profile.memoryDeleteFailed, description: error instanceof Error ? error.message : t.api.postFailed });
    } finally {
      setDeletingMemoryId(null);
    }
  }

  async function handleResetPreferences() {
    if (!window.confirm("確定要重置旅遊偏好嗎？這會清除目的地、預算、旅遊風格與交通偏好。")) {
      return;
    }
    setBulkAction("preferences");
    try {
      await resetTravelPreferences();
      store.updateProfile({
        destination: "",
        budget: 0,
        travelDays: 0,
        preferredTransport: "",
        travelPace: "",
        travelPreferences: [],
        interests: [],
      });
      setPace("");
      setPreferences([]);
      setInterests([]);
      setTransport("");
      pushToast({ variant: "success", title: "已重置旅遊偏好", description: "AI 後續不會再套用舊偏好。" });
    } catch (error) {
      pushToast({ variant: "error", title: "重置偏好失敗", description: error instanceof Error ? error.message : t.api.postFailed });
    } finally {
      setBulkAction(null);
    }
  }

  async function handleDeleteAiMemory() {
    if (!window.confirm("確定要刪除 AI 記憶嗎？這會刪除聊天記憶與 Mem0 向量記憶，且無法復原。")) {
      return;
    }
    setBulkAction("memory");
    try {
      await deleteAiMemory();
      setMemories([]);
      pushToast({ variant: "success", title: "已刪除 AI 記憶", description: "後續 AI context 不會再讀取舊聊天記憶。" });
    } catch (error) {
      pushToast({ variant: "error", title: "刪除 AI 記憶失敗", description: error instanceof Error ? error.message : t.api.postFailed });
    } finally {
      setBulkAction(null);
    }
  }

  async function handleClearPersonalizationData() {
    if (!window.confirm("確定要清除所有個人化資料嗎？這會清除偏好、聊天記憶、影片互動與套用紀錄，無法復原。歷史行程本身會保留。")) {
      return;
    }
    setBulkAction("all");
    try {
      await clearPersonalizationData();
      store.updateProfile({
        destination: "",
        budget: 0,
        travelDays: 0,
        preferredTransport: "",
        travelPace: "",
        travelPreferences: [],
        interests: [],
      });
      setPace("");
      setPreferences([]);
      setInterests([]);
      setTransport("");
      setMemories([]);
      pushToast({ variant: "success", title: "已清除個人化資料", description: "行程會保留，但個人化依據已清除。" });
    } catch (error) {
      pushToast({ variant: "error", title: "清除個人化資料失敗", description: error instanceof Error ? error.message : t.api.postFailed });
    } finally {
      setBulkAction(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          close(false);
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-0 overflow-hidden rounded-2xl border-border-light bg-surface p-0 shadow-soft-lg sm:max-w-lg"
      >
        <DialogHeader className="flex-row items-center justify-between border-b border-border-light px-6 py-4">
          <DialogTitle className="text-base font-bold">設定</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => close(false)}
            className="rounded-lg"
          >
            <X className="size-5" aria-hidden />
          </Button>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <section>
                <h3 className="mb-3 font-semibold text-foreground">{t.profile.travelPace}</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {paceOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPace((c) => (c === opt.value ? "" : opt.value))}
                      className={`cursor-pointer rounded-xl border-2 p-4 text-center transition-all ${
                        pace === opt.value
                          ? "border-primary bg-primary/5"
                          : "border-border-light hover:border-primary/30"
                      }`}
                    >
                      <p className="text-sm font-medium text-foreground">{opt.label}</p>
                      <p className="mt-1 text-[11px] text-muted">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-1 flex items-center gap-2 font-semibold text-foreground">
                  <Heart className="size-4 text-secondary" />
                  {t.profile.travelInterests}
                </h3>
                <p className="mb-3 text-xs text-muted">{t.profile.tagsHint}</p>
                <div className="flex flex-wrap gap-2">
                  {preferenceOptions.map((pref) => (
                    <button
                      key={pref.value}
                      type="button"
                      onClick={() => togglePreference(pref.value)}
                      className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
                        preferences.includes(pref.value)
                          ? "border-secondary/30 bg-secondary/15 text-secondary"
                          : "border-transparent bg-border-light text-muted hover:bg-secondary/10 hover:text-secondary"
                      }`}
                    >
                      {preferences.includes(pref.value) ? t.profile.selectedPrefix : ""}
                      {pref.label}
                    </button>
                  ))}
                  {preferences
                    .filter((p) => !preferenceOptions.some((o) => o.value === p))
                    .map((custom) => (
                      <button
                        key={custom}
                        type="button"
                        onClick={() => togglePreference(custom)}
                        className="cursor-pointer rounded-full border border-secondary/30 bg-secondary/15 px-3.5 py-1.5 text-sm font-medium text-secondary transition-all"
                      >
                        {t.profile.selectedPrefix}{custom}
                      </button>
                    ))}
                  {showCustomInput ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={customInterest}
                        onChange={(e) => setCustomInterest(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); addCustomInterest(); }
                          if (e.key === "Escape") { setShowCustomInput(false); setCustomInterest(""); }
                        }}
                        placeholder="輸入自訂興趣"
                        autoFocus
                        className="w-28 rounded-full border border-border bg-cream/50 px-3 py-1.5 text-sm text-foreground outline-none transition-all focus:border-secondary/50 focus:ring-2 focus:ring-secondary/30"
                      />
                      <button
                        type="button"
                        onClick={addCustomInterest}
                        disabled={!customInterest.trim()}
                        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-secondary text-white transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Check className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowCustomInput(false); setCustomInterest(""); }}
                        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-border-light text-muted transition-colors hover:bg-red-100 hover:text-red-500"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCustomInput(true)}
                      className="flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-border px-3.5 py-1.5 text-sm font-medium text-muted transition-all hover:border-secondary/40 hover:bg-secondary/5 hover:text-secondary"
                    >
                      <Plus className="size-3.5" />
                      自訂
                    </button>
                  )}
                </div>
              </section>

              <section>
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                  <Globe className="size-4 text-primary" />
                  {t.profile.preferredTransport}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {transportOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTransport((c: string) => (c === opt.value ? "" : opt.value))}
                      className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
                        transport === opt.value
                          ? "border-primary/30 bg-primary/15 text-primary"
                          : "border-transparent bg-border-light text-muted hover:bg-primary/10 hover:text-primary"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </section>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                    saved
                      ? "bg-tertiary text-white"
                      : "bg-primary text-white hover:bg-primary-dark"
                  }`}
                >
                  {saving ? (
                    <><Save className="size-4 animate-pulse" />{t.profile.saving}</>
                  ) : saved ? (
                    <><Check className="size-4" />{t.profile.saved}</>
                  ) : (
                    <><Save className="size-4" />{t.profile.save}</>
                  )}
                </button>
              </div>

              <section>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{t.profile.memoryTitle}</h3>
                    <p className="mt-0.5 text-xs text-muted">{t.profile.memorySubtitle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadMemories()}
                    disabled={memoriesLoading || Boolean(savingMemoryId || deletingMemoryId)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-cream/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCcw className="size-3.5" />
                    {t.profile.memoryRefresh}
                  </button>
                </div>

                {memoriesLoading ? (
                  <p className="text-sm text-muted">{t.profile.memoryLoading}</p>
                ) : memories.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border-light bg-cream/30 px-4 py-6 text-center text-sm text-muted">
                    {t.profile.memoryEmpty}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {memories.map((memory) => {
                      const isEditing = editingMemoryId === memory.id;
                      const isSavingMem = savingMemoryId === memory.id;
                      const isDeletingMem = deletingMemoryId === memory.id;
                      const updatedAt = memory.updated_at || memory.created_at;
                      const isTripSummary = memory.kind === "trip_summary" || memory.metadata?.source === "trip-summary";

                      return (
                        <div key={memory.id} className="rounded-2xl border border-border-light bg-cream/35 p-4">
                          {isEditing ? (
                            <div className="space-y-3">
                              <textarea
                                value={editingMemoryText}
                                onChange={(e) => setEditingMemoryText(e.target.value)}
                                className="min-h-[80px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => { setEditingMemoryId(null); setEditingMemoryText(""); }}
                                  className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface"
                                >
                                  {t.profile.memoryCancel}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleSaveMemory(memory.id)}
                                  disabled={isSavingMem || !editingMemoryText.trim()}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Save className="size-3.5" />
                                  {isSavingMem ? t.profile.memorySaving : t.profile.memorySave}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {isTripSummary ? (
                                <div className="mb-2 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                                  行程記憶
                                </div>
                              ) : null}
                              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                                {memory.memory}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[11px] text-muted">
                                  {updatedAt ? `${t.profile.memoryEditedAt} ${new Date(updatedAt).toLocaleString("zh-TW")}` : ""}
                                </p>
                                {!isTripSummary ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => { setEditingMemoryId(memory.id); setEditingMemoryText(memory.memory); }}
                                      className="inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface"
                                    >
                                      <Pencil className="size-3" />
                                      {t.profile.memoryEdit}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteMemory(memory.id)}
                                      disabled={isDeletingMem}
                                      className="inline-flex items-center gap-1 rounded-xl border border-danger/20 px-2.5 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <Trash2 className="size-3" />
                                      {isDeletingMem ? t.profile.memoryDeleting : t.profile.memoryDelete}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-danger/20 bg-danger/5 p-4">
                <h3 className="font-semibold text-danger">隱私與資料管理</h3>
                <p className="mt-1 text-xs text-muted">
                  這些操作會同步呼叫後端刪除資料；AI 後續 context 不會再讀取已清除的偏好或記憶。
                </p>
                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    onClick={() => void handleResetPreferences()}
                    disabled={bulkAction !== null}
                    className="rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-cream/60 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bulkAction === "preferences" ? "重置中..." : "重置旅遊偏好"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteAiMemory()}
                    disabled={bulkAction !== null}
                    className="rounded-xl border border-danger/30 bg-surface px-3 py-2 text-left text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bulkAction === "memory" ? "刪除中..." : "刪除 AI 記憶"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleClearPersonalizationData()}
                    disabled={bulkAction !== null}
                    className="rounded-xl bg-danger px-3 py-2 text-left text-sm font-semibold text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bulkAction === "all" ? "清除中..." : "清除所有個人化資料"}
                  </button>
                </div>
              </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
