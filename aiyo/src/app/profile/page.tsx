"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { m } from "@/lib/motion";
import { Camera, Check, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { resizeAvatarImage } from "@/lib/resizeAvatarImage";
import { zhTW as t } from "@/locales/zh-TW";
import { syncService } from "@/services/syncService";
import { useProfileStore } from "@/stores/useProfileStore";
import { useToastStore } from "@/stores/useToastStore";

type EditingField = "name" | "email" | null;

function profileInitials(name: string, email: string): string {
  const source = name.trim() || email.trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export default function ProfilePage() {
  const router = useRouter();
  const { data: session, status, update: updateSession } = useSession();
  const store = useProfileStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(store.name);
  const [email, setEmail] = useState(store.email);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(session?.user?.image ?? null);
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const hasChanges = name !== store.name || email !== store.email;

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
    if (session?.user?.image) {
      setAvatarUrl(session.user.image);
    }
  }, [session?.user?.image]);

  useEffect(() => {
    if (editingField === "name") {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
    if (editingField === "email") {
      emailInputRef.current?.focus();
      emailInputRef.current?.select();
    }
  }, [editingField]);

  const initials = useMemo(() => profileInitials(name, email), [email, name]);
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

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsUploadingAvatar(true);
    try {
      const resized = await resizeAvatarImage(file);
      const { image } = await syncService.uploadAvatar(resized);
      setAvatarUrl(image);
      await updateSession({ image });
      pushToast({
        variant: "success",
        title: t.profile.avatarUpdated,
      });
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.profile.avatarUploadFailed,
        description: error instanceof Error ? error.message : t.profile.avatarUploadFailedDesc,
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleSave() {
    if (!hasChanges) return;

    const nextProfile = { name, email };

    setIsSaving(true);
    store.updateProfile(nextProfile);

    try {
      const persistedProfile = await syncService.saveProfile(nextProfile);
      store.updateProfile(persistedProfile);
      await updateSession({ name });
      setEditingField(null);
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
    <div className="min-h-screen max-w-3xl mx-auto p-6 lg:p-8">
      <m.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <UserIcon className="size-6 text-primary" />
          {t.profile.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.profile.subtitle}</p>
      </m.div>

      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="relative rounded-2xl border border-border-light bg-surface p-6 pb-16 shadow-soft"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingAvatar}
            aria-label={t.profile.changeAvatar}
            className="group relative mx-auto size-24 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-primary/20 bg-cream/50 sm:mx-0 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded avatar URL
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-2xl font-semibold text-primary">
                {initials}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-disabled:opacity-100">
              {isUploadingAvatar ? (
                <span className="text-xs font-medium text-white">{t.profile.avatarUploading}</span>
              ) : (
                <Camera className="size-6 text-white" aria-hidden />
              )}
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => void handleAvatarChange(event)}
          />

          <div className="min-w-0 flex-1 space-y-3">
            <div>
              {editingField === "name" ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setEditingField(null);
                    }
                    if (event.key === "Escape") {
                      setName(store.name);
                      setEditingField(null);
                    }
                  }}
                  className="w-full rounded-xl border border-primary/40 bg-cream/50 px-3 py-2 text-lg font-semibold text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingField("name")}
                  className="block w-full cursor-pointer rounded-lg px-1 py-1 text-left text-lg font-semibold text-foreground transition-colors hover:bg-cream/60"
                >
                  {name.trim() || t.profile.notSet}
                </button>
              )}
            </div>

            <div>
              {editingField === "email" ? (
                <input
                  ref={emailInputRef}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setEditingField(null);
                    }
                    if (event.key === "Escape") {
                      setEmail(store.email);
                      setEditingField(null);
                    }
                  }}
                  className="w-full rounded-xl border border-primary/40 bg-cream/50 px-3 py-2 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingField("email")}
                  className="block w-full cursor-pointer rounded-lg px-1 py-1 text-left text-sm text-muted transition-colors hover:bg-cream/60 hover:text-foreground"
                >
                  {email.trim() || t.profile.notSet}
                </button>
              )}
            </div>
          </div>
        </div>

        {hasChanges ? (
          <div className="absolute bottom-4 right-4">
            <Button
              type="button"
              size="icon"
              onClick={() => void handleSave()}
              disabled={isSaving || isUploadingAvatar}
              aria-label={t.profile.save}
              className="size-10 rounded-full bg-primary text-white shadow-md hover:bg-primary-dark"
            >
              <Check className={`size-4 ${isSaving ? "animate-pulse" : ""}`} />
            </Button>
          </div>
        ) : null}
      </m.div>
    </div>
  );
}
