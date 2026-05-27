"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Mail, Pencil, RefreshCcw, Save, Trash2, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { zhTW as t } from "@/locales/zh-TW";
import { deleteMemory, listMemories, updateMemory } from "@/services/aiClient";
import { syncService } from "@/services/syncService";
import { useProfileStore } from "@/stores/useProfileStore";
import { useToastStore } from "@/stores/useToastStore";
import type { MemoryRecord } from "@/types";

export default function ProfilePage() {
  const router = useRouter();
  const { status } = useSession();
  const store = useProfileStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const [name, setName] = useState(store.name);
  const [email, setEmail] = useState(store.email);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryText, setEditingMemoryText] = useState("");
  const [savingMemoryId, setSavingMemoryId] = useState<string | null>(null);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);

  const loadUserMemories = useCallback(async () => {
    setMemoriesLoading(true);
    try {
      setMemories(await listMemories());
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
  }, [store.email, store.name]);

  useEffect(() => {
    if (status === "authenticated") {
      void loadUserMemories();
    }
  }, [loadUserMemories, status]);

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

  async function handleSave() {
    const nextProfile = { name, email };

    setIsSaving(true);
    store.updateProfile(nextProfile);

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
    const next = editingMemoryText.trim();
    if (!next) {
      return;
    }
    setSavingMemoryId(memoryId);
    try {
      const updated = await updateMemory(memoryId, next);
      setMemories((items) => items.map((item) => (item.id === memoryId ? updated : item)));
      setEditingMemoryId(null);
      setEditingMemoryText("");
      pushToast({ variant: "success", title: t.profile.memoryUpdated, description: t.profile.memoryUpdatedDesc });
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
      setMemories((items) => items.filter((item) => item.id !== memoryId));
      if (editingMemoryId === memoryId) {
        setEditingMemoryId(null);
        setEditingMemoryText("");
      }
      pushToast({ variant: "success", title: t.profile.memoryDeleted, description: t.profile.memoryDeletedDesc });
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
          </div>
        </motion.div>

        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="rounded-2xl border border-border-light bg-surface p-6 shadow-soft">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">{t.profile.memoryTitle}</h2>
              <p className="mt-1 text-sm text-muted">{t.profile.memorySubtitle}</p>
            </div>
            <button
              type="button"
              data-testid="memory-refresh-button"
              onClick={() => void loadUserMemories()}
              disabled={memoriesLoading || Boolean(savingMemoryId || deletingMemoryId)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-cream/50 disabled:cursor-not-allowed disabled:opacity-50"
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
                const isSavingMemory = savingMemoryId === memory.id;
                const isDeletingMemory = deletingMemoryId === memory.id;
                const updatedAt = memory.updated_at || memory.created_at;

                return (
                  <div key={memory.id} data-testid="memory-item" className="rounded-2xl border border-border-light bg-cream/35 p-4">
                    {isEditing ? (
                      <div className="space-y-3">
                        <textarea
                          data-testid="memory-edit-input"
                          value={editingMemoryText}
                          onChange={(event) => setEditingMemoryText(event.target.value)}
                          className="min-h-[80px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMemoryId(null);
                              setEditingMemoryText("");
                            }}
                            className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface"
                          >
                            {t.profile.memoryCancel}
                          </button>
                          <button
                            type="button"
                            data-testid="memory-save-button"
                            onClick={() => void handleSaveMemory(memory.id)}
                            disabled={isSavingMemory || !editingMemoryText.trim()}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Save className="size-3.5" />
                            {isSavingMemory ? t.profile.memorySaving : t.profile.memorySave}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{memory.memory}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] text-muted">
                            {updatedAt ? `${t.profile.memoryEditedAt} ${new Date(updatedAt).toLocaleString("zh-TW")}` : ""}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              data-testid="memory-edit-button"
                              onClick={() => {
                                setEditingMemoryId(memory.id);
                                setEditingMemoryText(memory.memory);
                              }}
                              className="inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface"
                            >
                              <Pencil className="size-3" />
                              {t.profile.memoryEdit}
                            </button>
                            <button
                              type="button"
                              data-testid="memory-delete-button"
                              onClick={() => void handleDeleteMemory(memory.id)}
                              disabled={isDeletingMemory}
                              className="inline-flex items-center gap-1 rounded-xl border border-danger/20 px-2.5 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 className="size-3" />
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

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="flex justify-end pb-8">
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
      </div>
    </div>
  );
}
