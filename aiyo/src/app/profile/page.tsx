"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Globe, Heart, Mail, MapPin, Save, User, Wallet } from "lucide-react";
import { zhTW as t } from "@/locales/zh-TW";
import { syncService } from "@/services/syncService";
import { useProfileStore } from "@/stores/useProfileStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";

const transportOptions = [
  { value: "Train", label: t.profile.transportTrain },
  { value: "Metro", label: t.profile.transportMetro },
  { value: "Walk", label: t.profile.transportWalk },
  { value: "Taxi", label: t.profile.transportTaxi },
  { value: "Mixed", label: t.profile.transportMixed },
];

const paceOptions = [
  { value: "relaxed" as const, label: t.profile.paceRelaxed, desc: t.profile.paceRelaxedDesc },
  { value: "moderate" as const, label: t.profile.paceModerate, desc: t.profile.paceModerateDesc },
  { value: "intensive" as const, label: t.profile.paceIntensive, desc: t.profile.paceIntensiveDesc },
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
  const store = useProfileStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const setTripDestination = useTripStore((state) => state.setDestination);
  const setTripBudget = useTripStore((state) => state.setBudget);
  const [name, setName] = useState(store.name);
  const [email, setEmail] = useState(store.email);
  const [destination, setDestination] = useState(store.destination);
  const [budget, setBudget] = useState(store.budget.toString());
  const [preferences, setPreferences] = useState<string[]>(store.travelPreferences);
  const [transport, setTransport] = useState(store.preferredTransport);
  const [pace, setPace] = useState(store.travelPace);
  const [interests, setInterests] = useState<string[]>(store.interests);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setName(store.name);
    setEmail(store.email);
    setDestination(store.destination);
    setBudget(store.budget.toString());
    setPreferences(store.travelPreferences);
    setTransport(store.preferredTransport);
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
    const parsedBudget = parseInt(budget, 10) || 0;
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

  return (
    <div className="min-h-screen max-w-3xl mx-auto p-6 lg:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <User className="size-6 text-primary" />
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
                <User className="size-4 text-muted" />
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
                    onClick={() => setTransport(option.value)}
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
          <div className="grid grid-cols-3 gap-3">
            {paceOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setPace(option.value)}
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
      </div>
    </div>
  );
}
