"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Brain,
  Check,
  Compass,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import InterestPickerDialog from "@/components/settings/InterestPickerDialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getInterestIcon,
  getInterestLabel,
  getPaceOption,
  normalizePreferredTransport,
  paceOptions,
  transportOptions,
} from "@/data/travelPreferenceOptions";
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

type SettingsPage = "preferences" | "memory" | "privacy";

function SelectedInterestChip({
  value,
  interestIcons,
  onRemove,
  readOnly,
}: {
  value: string;
  interestIcons: Record<string, string>;
  onRemove?: () => void;
  readOnly: boolean;
}) {
  const Icon = getInterestIcon(value, interestIcons);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1.5 text-sm font-medium text-secondary">
      <Icon className="size-3.5 shrink-0" />
      {getInterestLabel(value)}
      {!readOnly && onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 flex size-4 cursor-pointer items-center justify-center rounded-full text-secondary/70 transition-colors hover:bg-secondary/20 hover:text-secondary"
          aria-label={`移除 ${getInterestLabel(value)}`}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

export default function SettingsModal() {
  const open = useUIStore((s) => s.settingsModalOpen);
  const close = useUIStore((s) => s.setSettingsModalOpen);
  const store = useProfileStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const [activePage, setActivePage] = useState<SettingsPage>("preferences");
  const [isEditing, setIsEditing] = useState(false);
  const [pace, setPace] = useState<User["travelPace"]>(store.travelPace);
  const [preferences, setPreferences] = useState<string[]>(store.travelPreferences);
  const [interests, setInterests] = useState<string[]>(store.interests);
  const [interestIcons, setInterestIcons] = useState<Record<string, string>>(store.interestIcons ?? {});
  const [transport, setTransport] = useState(() => normalizePreferredTransport(store.preferredTransport));
  const [interestPickerOpen, setInterestPickerOpen] = useState(false);
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

  function resetLocalState() {
    setPace(store.travelPace);
    setPreferences(store.travelPreferences);
    setInterests(store.interests);
    setInterestIcons(store.interestIcons ?? {});
    setTransport(normalizePreferredTransport(store.preferredTransport));
    setInterestPickerOpen(false);
    setSaved(false);
  }

  useEffect(() => {
    if (!open) return;
    setActivePage("preferences");
    setIsEditing(false);
    resetLocalState();
    void loadMemories();
  }, [open, store.travelPace, store.travelPreferences, store.interests, store.interestIcons, store.preferredTransport, loadMemories]);

  function handlePageChange(value: string) {
    if (isEditing) {
      resetLocalState();
      setIsEditing(false);
    }
    setActivePage(value as SettingsPage);
  }

  function togglePreference(pref: string) {
    setPreferences((c) => (c.includes(pref) ? c.filter((i) => i !== pref) : [...c, pref]));
    setInterests((c) => (c.includes(pref) ? c.filter((i) => i !== pref) : [...c, pref]));
  }

  function removeInterest(pref: string) {
    setPreferences((c) => c.filter((i) => i !== pref));
    setInterests((c) => c.filter((i) => i !== pref));
  }

  function addCustomInterest(value: string, iconName: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!preferences.includes(trimmed)) {
      setPreferences((c) => [...c, trimmed]);
      setInterests((c) => [...c, trimmed]);
      setInterestIcons((c) => ({ ...c, [trimmed]: iconName }));
    }
  }

  function handleCancelEdit() {
    resetLocalState();
    setIsEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    const updates = {
      travelPace: pace,
      travelPreferences: preferences,
      interests,
      interestIcons,
      preferredTransport: transport,
    };
    store.updateProfile(updates);
    try {
      const persisted = await syncService.saveProfile(updates);
      store.updateProfile(persisted);
      setSaved(true);
      setIsEditing(false);
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
        interestIcons: {},
      });
      setPace("");
      setPreferences([]);
      setInterests([]);
      setInterestIcons({});
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
        interestIcons: {},
      });
      setPace("");
      setPreferences([]);
      setInterests([]);
      setInterestIcons({});
      setTransport("");
      setMemories([]);
      pushToast({ variant: "success", title: "已清除個人化資料", description: "行程會保留，但個人化依據已清除。" });
    } catch (error) {
      pushToast({ variant: "error", title: "清除個人化資料失敗", description: error instanceof Error ? error.message : t.api.postFailed });
    } finally {
      setBulkAction(null);
    }
  }

  const selectedPace = getPaceOption(pace);
  const selectedTransport = transportOptions.find((opt) => opt.value === transport) ?? null;

  return (
    <>
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
          className="flex h-[min(85vh,680px)] w-full max-w-lg flex-col gap-0 overflow-hidden rounded-2xl border-border-light bg-surface p-0 shadow-soft-lg sm:max-w-lg"
        >
          <DialogHeader className="shrink-0 flex-row items-center justify-between border-b border-border-light px-6 py-4">
            <DialogTitle className="text-base font-bold">{t.profile.settingsTitle}</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => close(false)}
                className="rounded-lg"
              >
                <X className="size-5" aria-hidden />
              </Button>
            </div>
          </DialogHeader>

          <Tabs
            value={activePage}
            onValueChange={handlePageChange}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <div className="shrink-0 px-6 py-3">
              <TabsList className="flex h-auto min-h-11 w-full items-center gap-1 rounded-full border border-border-light bg-cream/80 p-1 shadow-none">
                <TabsTrigger
                  value="preferences"
                  aria-label={t.profile.settingsTabPreferences}
                  className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-transparent bg-transparent px-2 text-muted-foreground shadow-none ring-0 outline-none after:hidden transition-colors hover:bg-transparent hover:text-foreground focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-none data-active:border-primary/35 data-active:bg-primary/10 data-active:text-primary data-active:shadow-none sm:gap-1.5 sm:px-2.5"
                >
                  <Compass className="size-3.5 shrink-0 sm:size-4" />
                  <span className="truncate text-[10px] font-medium sm:text-xs">{t.profile.settingsTabPreferences}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="memory"
                  data-testid="settings-memory-tab"
                  aria-label={t.profile.settingsTabMemory}
                  className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-transparent bg-transparent px-2 text-muted-foreground shadow-none ring-0 outline-none after:hidden transition-colors hover:bg-transparent hover:text-foreground focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-none data-active:border-primary/35 data-active:bg-primary/10 data-active:text-primary data-active:shadow-none sm:gap-1.5 sm:px-2.5"
                >
                  <Brain className="size-3.5 shrink-0 sm:size-4" />
                  <span className="truncate text-[10px] font-medium sm:text-xs">{t.profile.settingsTabMemory}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="privacy"
                  aria-label={t.profile.settingsTabPrivacy}
                  className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-transparent bg-transparent px-2 text-muted-foreground shadow-none ring-0 outline-none after:hidden transition-colors hover:bg-transparent hover:text-foreground focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-none data-active:border-primary/35 data-active:bg-primary/10 data-active:text-primary data-active:shadow-none sm:gap-1.5 sm:px-2.5"
                >
                  <Shield className="size-3.5 shrink-0 sm:size-4" />
                  <span className="truncate text-[10px] font-medium sm:text-xs">{t.profile.settingsTabPrivacy}</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="relative min-h-0 flex-1">
            <TabsContent value="preferences" className="absolute inset-0 overflow-hidden">
              <div className="h-full overflow-y-auto px-6 py-5 pb-20">
              <div className="space-y-4">
            <Card className="border-border-light bg-cream/20 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle>{t.profile.travelPace}</CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {paceOptions.map((opt) => {
                      const Icon = opt.icon;
                      return (
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
                          <Icon className="mx-auto mb-2 size-5 text-primary" />
                          <p className="text-sm font-medium text-foreground">{opt.label}</p>
                        </button>
                      );
                    })}
                  </div>
                ) : selectedPace ? (
                  <div className="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                    <selectedPace.icon className="size-5 text-primary" />
                    <p className="text-sm font-medium text-foreground">{selectedPace.label}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted">{t.profile.notSet}</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border-light bg-cream/20 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle>{t.profile.travelInterests}</CardTitle>
              </CardHeader>
              <CardContent>
                {preferences.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {preferences.map((pref) => (
                      <SelectedInterestChip
                        key={pref}
                        value={pref}
                        interestIcons={interestIcons}
                        readOnly={!isEditing}
                        onRemove={isEditing ? () => removeInterest(pref) : undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">{t.profile.noInterests}</p>
                )}
                {isEditing ? (
                  <button
                    type="button"
                    onClick={() => setInterestPickerOpen(true)}
                    className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-border px-3.5 py-1.5 text-sm font-medium text-muted transition-all hover:border-secondary/40 hover:bg-secondary/5 hover:text-secondary"
                  >
                    <Plus className="size-3.5" />
                    {t.profile.addInterest}
                  </button>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-border-light bg-cream/20 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle>{t.profile.preferredTransport}</CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="flex flex-wrap gap-2">
                    {transportOptions.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setTransport((c: string) => (c === opt.value ? "" : opt.value))}
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
                            transport === opt.value
                              ? "border-primary/30 bg-primary/15 text-primary"
                              : "border-transparent bg-border-light text-muted hover:bg-primary/10 hover:text-primary"
                          }`}
                        >
                          <Icon className="size-3.5" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                ) : selectedTransport ? (
                  <div className="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
                    <selectedTransport.icon className="size-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">{selectedTransport.label}</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted">{t.profile.notSet}</p>
                )}
              </CardContent>
            </Card>
              </div>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end p-4">
                <div className="pointer-events-auto flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleCancelEdit}
                        disabled={saving}
                        aria-label={t.profile.cancelEdit}
                        className="size-10 rounded-full bg-surface shadow-md"
                      >
                        <X className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        onClick={() => void handleSave()}
                        disabled={saving}
                        aria-label={saved ? t.profile.saved : t.profile.save}
                        className="size-10 rounded-full bg-primary text-white shadow-md hover:bg-primary-dark"
                      >
                        {saving ? (
                          <Save className="size-4 animate-pulse" />
                        ) : saved ? (
                          <Check className="size-4" />
                        ) : (
                          <Save className="size-4" />
                        )}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="icon"
                      onClick={() => setIsEditing(true)}
                      aria-label={t.profile.edit}
                      className="size-10 rounded-full bg-primary text-white shadow-md hover:bg-primary-dark"
                    >
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="memory" className="absolute inset-0 overflow-y-auto px-6 py-5">
            <Card className="border-border-light bg-cream/20 shadow-none">
              <CardHeader className="pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{t.profile.memoryTitle}</CardTitle>
                  </div>
                  <button
                    type="button"
                    data-testid="memory-refresh-button"
                    onClick={() => void loadMemories()}
                    disabled={memoriesLoading || Boolean(savingMemoryId || deletingMemoryId)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-cream/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCcw className="size-3.5" />
                    {t.profile.memoryRefresh}
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {memoriesLoading ? (
                  <p className="text-sm text-muted">{t.profile.memoryLoading}</p>
                ) : memories.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border-light bg-cream/30 px-4 py-6 text-center text-sm text-muted">
                    {t.profile.memoryEmpty}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {memories.map((memory) => {
                      const isEditingMem = editingMemoryId === memory.id;
                      const isSavingMem = savingMemoryId === memory.id;
                      const isDeletingMem = deletingMemoryId === memory.id;
                      const updatedAt = memory.updated_at || memory.created_at;
                      const isTripSummary = memory.kind === "trip_summary" || memory.metadata?.source === "trip-summary";

                      return (
                        <div key={memory.id} data-testid="memory-item" className="rounded-2xl border border-border-light bg-cream/35 p-4">
                          {isEditingMem ? (
                            <div className="space-y-3">
                              <textarea
                                data-testid="memory-edit-input"
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
                                  data-testid="memory-save-button"
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
                                      data-testid="memory-edit-button"
                                      onClick={() => { setEditingMemoryId(memory.id); setEditingMemoryText(memory.memory); }}
                                      className="inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface"
                                    >
                                      <Pencil className="size-3" />
                                      {t.profile.memoryEdit}
                                    </button>
                                    <button
                                      type="button"
                                      data-testid="memory-delete-button"
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
              </CardContent>
            </Card>
            </TabsContent>

            <TabsContent value="privacy" className="absolute inset-0 overflow-y-auto px-6 py-5">
            <Card className="border-danger/20 bg-danger/5 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-danger">隱私與資料管理</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
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
              </CardContent>
            </Card>
            </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      <InterestPickerDialog
        open={interestPickerOpen}
        onOpenChange={setInterestPickerOpen}
        selected={preferences}
        interestIcons={interestIcons}
        onToggle={togglePreference}
        onAddCustom={addCustomInterest}
      />
    </>
  );
}
