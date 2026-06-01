"use client";

import { useEffect, useState } from "react";
import { m } from "@/lib/motion";
import { Check, Mail, Save, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { zhTW as t } from "@/locales/zh-TW";
import { syncService } from "@/services/syncService";
import { useProfileStore } from "@/stores/useProfileStore";
import { useToastStore } from "@/stores/useToastStore";

export default function ProfilePage() {
  const router = useRouter();
  const { status } = useSession();
  const store = useProfileStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const [name, setName] = useState(store.name);
  const [email, setEmail] = useState(store.email);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent("/profile")}`);
    }
  }, [router, status]);

  useEffect(() => {
    setName(store.name);
    setEmail(store.email);
  }, [store.email, store.name]);

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

  return (
    <div className="mx-auto min-h-screen max-w-3xl p-6 lg:p-8">
      <m.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <UserIcon className="size-6 text-primary" />
          {t.profile.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.profile.subtitle}</p>
      </m.div>

      <div className="flex flex-col gap-6">
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-border-light bg-surface p-6 shadow-soft"
        >
          <h2 className="mb-4 font-semibold text-foreground">{t.profile.basicDetails}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <UserIcon className="size-4 text-muted" />
                {t.profile.name}
              </label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-border bg-cream/50 px-4 py-2.5 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Mail className="size-4 text-muted" />
                {t.profile.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-border bg-cream/50 px-4 py-2.5 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </m.div>

        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex justify-end pb-8"
        >
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
        </m.div>
      </div>
    </div>
  );
}
