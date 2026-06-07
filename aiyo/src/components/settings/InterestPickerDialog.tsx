"use client";

import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CUSTOM_INTEREST_ICON_OPTIONS,
  getInterestIcon,
  getInterestLabel,
  interestOptions,
  isPresetInterest,
} from "@/data/travelPreferenceOptions";
import { zhTW as t } from "@/locales/zh-TW";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string[];
  interestIcons: Record<string, string>;
  onToggle: (value: string) => void;
  onAddCustom: (value: string, iconName: string) => void;
};

export default function InterestPickerDialog({
  open,
  onOpenChange,
  selected,
  interestIcons,
  onToggle,
  onAddCustom,
}: Props) {
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customIcon, setCustomIcon] = useState(CUSTOM_INTEREST_ICON_OPTIONS[0]?.name ?? "Star");

  const customSelected = useMemo(
    () => selected.filter((value) => !isPresetInterest(value)),
    [selected],
  );

  function resetCustomForm() {
    setShowCustomForm(false);
    setCustomName("");
    setCustomIcon(CUSTOM_INTEREST_ICON_OPTIONS[0]?.name ?? "Star");
  }

  function handleAddCustom() {
    const trimmed = customName.trim();
    if (!trimmed) return;
    onAddCustom(trimmed, customIcon);
    resetCustomForm();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) resetCustomForm();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex max-h-[80vh] w-full max-w-md flex-col gap-0 overflow-hidden rounded-2xl border-border-light bg-surface p-0">
        <DialogHeader className="border-b border-border-light px-5 py-4">
          <DialogTitle className="text-base font-bold">{t.profile.interestPickerTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {interestOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onToggle(opt.value)}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
                    isSelected
                      ? "border-secondary/40 bg-secondary/10 text-secondary"
                      : "border-border-light bg-cream/30 text-foreground hover:border-secondary/30"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-medium">{opt.label}</span>
                  {isSelected ? <Check className="size-3.5 shrink-0" /> : null}
                </button>
              );
            })}
          </div>

          {customSelected.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium text-muted">{t.profile.customInterests}</p>
              <div className="flex flex-wrap gap-2">
                {customSelected.map((value) => {
                  const Icon = getInterestIcon(value, interestIcons);
                  const isSelected = selected.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onToggle(value)}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
                        isSelected
                          ? "border-secondary/40 bg-secondary/10 text-secondary"
                          : "border-border-light bg-cream/30 text-muted"
                      }`}
                    >
                      <Icon className="size-3.5" />
                      {getInterestLabel(value)}
                      {isSelected ? <Check className="size-3" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {showCustomForm ? (
            <div className="rounded-xl border border-border-light bg-cream/30 p-4">
              <p className="mb-3 text-sm font-medium text-foreground">{t.profile.addCustomInterest}</p>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={t.profile.customInterestPlaceholder}
                className="mb-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-secondary/50 focus:ring-2 focus:ring-secondary/20"
              />
              <p className="mb-2 text-xs text-muted">{t.profile.chooseIcon}</p>
              <div className="mb-3 grid grid-cols-5 gap-2">
                {CUSTOM_INTEREST_ICON_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.name}
                      type="button"
                      onClick={() => setCustomIcon(opt.name)}
                      className={`flex size-10 cursor-pointer items-center justify-center rounded-xl border transition-all ${
                        customIcon === opt.name
                          ? "border-secondary bg-secondary/10 text-secondary"
                          : "border-border-light bg-surface text-muted hover:border-secondary/30"
                      }`}
                    >
                      <Icon className="size-4" />
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={resetCustomForm}>
                  {t.profile.memoryCancel}
                </Button>
                <Button type="button" size="sm" onClick={handleAddCustom} disabled={!customName.trim()}>
                  {t.profile.addInterest}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustomForm(true)}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm font-medium text-muted transition-all hover:border-secondary/40 hover:bg-secondary/5 hover:text-secondary"
            >
              <Plus className="size-4" />
              {t.profile.addCustomInterest}
            </button>
          )}
        </div>

        <div className="border-t border-border-light px-5 py-3">
          <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>
            {t.profile.interestPickerDone}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
