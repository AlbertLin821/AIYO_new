"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Globe, Heart, Mail, MapPin, Pencil, RefreshCcw, Save, Trash2, User as UserIcon, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { zhTW as t } from "@/locales/zh-TW";
import { deleteMemory, listMemories, updateMemory } from "@/services/aiClient";
import { syncService } from "@/services/syncService";
import { useProfileStore } from "@/stores/useProfileStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import type { MemoryRecord, User } from "@/types";

function normalizePreferredTransport(raw: string): string {
  const u = raw.trim();
  if (["Driving", "Transit", "Walking", "Bicycling"].includes(u)) {
    return u;
  }
  if (/walk/i.test(u)) {
    return "Walking";
  }
  if (/bike|bicycle|單車|自行車/i.test(u)) {
    return "Bicycling";
  }
  if (/metro|train|bus|mixed|taxi|car|drive|火車|地鐵|捷運|巴士|混合|開車|計程車|汽車/i.test(u)) {
    return /taxi|car|drive|開車|計程車|汽車|自駕/i.test(u) ? "Driving" : "Transit";
  }
  return "Transit";
}

const transportOptions = [
  { value: "Driving", label: t.profile.transportDriving },
  { value: "Transit", label: t.profile.transportTransit },
  { value: "Walking", label: t.profile.transportWalking },
  { value: "Bicycling", label: t.profile.transportBicycling },
];

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

export default function ProfilePage() {
  const router = useRouter();
  const { status } = useSession();
  const store = useProfileStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const setTripDestination = useTripStore((state) => state.setDestination);
  const setTripBudget = useTripStore((state) => state.setBudget);
  const [name, setName] = useState(store.name);
  const [email, setEmail] = useState(store.email);
  const [destination, setDestination] = useState(store.destination);
  const [budget, setBudget] = useState(store.budget > 0 ? String(store.budget) : "");
  const [preferences, setPreferences] = useState<string[]>(store.travelPreferences);
  const [transport, setTransport] = useState(() => normalizePreferredTransport(store.preferredTransport));
  const [pace, setPace] = useState<User["travelPace"]>(store.travelPace);
  const [interests, setInterests] = useState<string[]>(store.interests);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(true);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryText, setEditingMemoryText] = useState("");
  const [savingMemoryId, setSavingMemoryId] = useState<string | null>(null);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);

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
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent("/profile")}`);
    }
  }, [router, status]);

  useEffect(() => {
    setName(store.name);
    setEmail(store.email);
    setDestination(store.destination);
    setBudget(store.budget > 0 ? String(store.budget) : "");
    setPreferences(store.travelPreferences);
    setTransport(normalizePreferredTransport(store.preferredTransport));
    setPace(store.travelPace);
    setInterests(store.interests);
  }, [
    store.budget,
    store.destination,
    store.email,
    store.interests,
    store.name,
    store.preferredTransport,
    store.travelPace,
    store.travelPreferences,
  ]);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-muted">{t.login.suspenseFallback}</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  function togglePreference(preference: string) {
    setPreferences((current) =>
      current.includes(preference)
        ? current.filter((item) => item !== preference)
        : [...current, preference],
    );
    setInterests((current) =>
      current.includes(preference)
        ? current.filter((item) => item !== preference)
        : [...current, preference],
    );
  }

  async function handleSave() {
    const parsedBudget = budget.trim() === "" ? 0 : parseInt(budget, 10) || 0;
    const nextProfile = {
      name,
      email,
      destination,
      budget: parsedBudget,
      travelPreferences: preferences,
      preferredTransport: transport,
      travelPace: pace,
      interests,
    };

    setIsSaving(true);
    store.updateProfile(nextProfile);
    setTripDestination(destination);
    setTripBudget(parsedBudget);

    try {
      const persistedProfile = await syncService.saveProfile(nextProfile);
      store.updateProfile(persistedProfile);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      pushToast({
        variant: "success",
        title: t.profile.syncedTitle,
        description: t.profile.syncedDesc,
      });
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.profile.syncFailedTitle,
        description: error instanceof Error ? error.message : t.profile.syncFailedDesc,
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveMemory(memoryId: string) {
    if (!editingMemoryText.trim()) {
      return;
    }

    setSavingMemoryId(memoryId);
    try {
      const updated = await updateMemory(memoryId, editingMemoryText.trim());
      setMemories((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setEditingMemoryId(null);
      setEditingMemoryText("");
      pushToast({
        variant: "success",
        title: t.profile.memoryUpdated,
        description: t.profile.memoryUpdatedDesc,
      });
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.profile.memoryUpdateFailed,
        description: error instanceof Error ? error.message : t.api.putFailed,
      });
    } finally {
      setSavingMemoryId(null);
    }
  }

  async function handleDeleteMemory(memoryId: string) {
    setDeletingMemoryId(memoryId);
    try {
      await deleteMemory(memoryId);
      setMemories((current) => current.filter((item) => item.id !== memoryId));
      if (editingMemoryId === memoryId) {
        setEditingMemoryId(null);
        setEditingMemoryText("");
      }
      pushToast({
        variant: "success",
        title: t.profile.memoryDeleted,
        description: t.profile.memoryDeletedDesc,
      });
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.profile.memoryDeleteFailed,
        description: error instanceof Error ? error.message : t.api.postFailed,
      });
    } finally {
      setDeletingMemoryId(null);
    }
  }

  return (
    <div className="min-h-screen max-w-3xl mx-auto p-6 lg:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <UserIcon className="size-6 text-primary" />
          {t.profile.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.profile.subtitle}</p>
      </motion.div>

      <div className="flex flex-col gap-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-2xl border border-border-light bg-surface p-6 shadow-soft">
          <h2 className="mb-4 font-semibold text-foreground">{t.profile.basicDetails}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <UserIcon className="size-4 text-muted" />
                {t.profile.name}
              </label>
              <input type="text" value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-border bg-cream/50 px-4 py-2.5 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Mail className="size-4 text-muted" />
                {t.profile.email}
              </label>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-border bg-cream/50 px-4 py-2.5 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <MapPin className="size-4 text-muted" />
                {t.profile.defaultDestination}
              </label>
              <input type="text" value={destination} onChange={(event) => setDestination(event.target.value)} className="w-full rounded-xl border border-border bg-cream/50 px-4 py-2.5 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Wallet className="size-4 text-muted" />
                {t.profile.budgetTwd}
              </label>
              <input type="number" value={budget} onChange={(event) => setBudget(event.target.value)} className="w-full rounded-xl border border-border bg-cream/50 px-4 py-2.5 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Globe className="size-4 text-muted" />
                {t.profile.preferredTransport}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {transportOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setTransport((current: string) => (current === option.value ? "" : option.value))
                    }
                    className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-all ${transport === option.value ? "bg-primary text-white" : "bg-border-light text-muted hover:bg-primary/10 hover:text-primary"}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-2xl border border-border-light bg-surface p-6 shadow-soft">
          <h2 className="mb-4 font-semibold text-foreground">{t.profile.travelPace}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {paceOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setPace((current: User["travelPace"]) => (current === option.value ? "" : option.value))
                }
                className={`cursor-pointer rounded-xl border-2 p-4 text-center transition-all ${pace === option.value ? "border-primary bg-primary/5" : "border-border-light hover:border-primary/30"}`}
              >
                <p className="text-sm font-medium text-foreground">{option.label}</p>
                <p className="mt-1 text-[11px] text-muted">{option.desc}</p>
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-2xl border border-border-light bg-surface p-6 shadow-soft">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <Heart className="size-4 text-secondary" />
            {t.profile.travelInterests}
          </h2>
          <p className="mb-4 text-xs text-muted">{t.profile.tagsHint}</p>
          <div className="flex flex-wrap gap-2">
            {preferenceOptions.map((preference) => (
              <button
                key={preference.value}
                onClick={() => togglePreference(preference.value)}
                className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${preferences.includes(preference.value) ? "border-secondary/30 bg-secondary/15 text-secondary" : "border-transparent bg-border-light text-muted hover:bg-secondary/10 hover:text-secondary"}`}
              >
                {preferences.includes(preference.value) ? `${t.profile.selectedPrefix}` : ""}
                {preference.label}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="flex justify-end pb-8">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex cursor-pointer items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60 ${saved ? "bg-tertiary text-white" : "bg-primary text-white hover:bg-primary-dark hover:shadow-md"}`}
          >
            {isSaving ? (
              <>
                <Save className="size-4 animate-pulse" />
                {t.profile.saving}
              </>
            ) : saved ? (
              <>
                <Check className="size-4" />
                {t.profile.saved}
              </>
            ) : (
              <>
                <Save className="size-4" />
                {t.profile.save}
              </>
            )}
          </button>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-border-light bg-surface p-6 shadow-soft"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-foreground">{t.profile.memoryTitle}</h2>
              <p className="mt-1 text-sm text-muted">{t.profile.memorySubtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadMemories()}
              disabled={memoriesLoading || Boolean(savingMemoryId || deletingMemoryId)}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-cream/50 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="memory-refresh-button"
            >
              <RefreshCcw className="size-3.5" />
              {t.profile.memoryRefresh}
            </button>
          </div>

          {memoriesLoading ? (
            <p className="text-sm text-muted">{t.profile.memoryLoading}</p>
          ) : memories.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-light bg-cream/30 px-4 py-8 text-center text-sm text-muted">
              {t.profile.memoryEmpty}
            </div>
          ) : (
            <div className="flex flex-col gap-3" data-testid="memory-list">
              {memories.map((memory) => {
                const isEditing = editingMemoryId === memory.id;
                const isSavingMemory = savingMemoryId === memory.id;
                const isDeletingMemory = deletingMemoryId === memory.id;
                const updatedAt = memory.updated_at || memory.created_at;

                return (
                  <div
                    key={memory.id}
                    className="rounded-2xl border border-border-light bg-cream/35 p-4"
                    data-testid="memory-item"
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <textarea
                          value={editingMemoryText}
                          onChange={(event) => setEditingMemoryText(event.target.value)}
                          className="min-h-[96px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                          data-testid="memory-edit-input"
                        />
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMemoryId(null);
                              setEditingMemoryText("");
                            }}
                            className="rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-surface"
                          >
                            {t.profile.memoryCancel}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSaveMemory(memory.id)}
                            disabled={isSavingMemory || !editingMemoryText.trim()}
                            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                            data-testid="memory-save-button"
                          >
                            <Save className="size-3.5" />
                            {isSavingMemory ? t.profile.memorySaving : t.profile.memorySave}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground" data-testid="memory-text">
                          {memory.memory}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-[11px] text-muted">
                            {updatedAt
                              ? `${t.profile.memoryEditedAt} ${new Date(updatedAt).toLocaleString("zh-TW")}`
                              : ""}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMemoryId(memory.id);
                                setEditingMemoryText(memory.memory);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-surface"
                              data-testid="memory-edit-button"
                            >
                              <Pencil className="size-3.5" />
                              {t.profile.memoryEdit}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteMemory(memory.id)}
                              disabled={isDeletingMemory}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-danger/20 px-3 py-2 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                              data-testid="memory-delete-button"
                            >
                              <Trash2 className="size-3.5" />
                              {isDeletingMemory ? t.profile.memoryDeleting : t.profile.memoryDelete}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </motion.section>
      </div>
    </div>
  );
}
