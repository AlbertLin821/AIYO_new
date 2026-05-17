"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, ImageIcon } from "lucide-react";
import { zhTW as t } from "@/locales/zh-TW";
import {
  CHAT_BACKGROUND_PRESETS,
  type ChatBackgroundPresetId,
  getChatBackgroundPreset,
} from "@/lib/chatBackground";
import { cn } from "@/lib/utils";

const PRESET_LABELS: Record<ChatBackgroundPresetId, string> = {
  mist: t.chat.backgroundMist,
  dawn: t.chat.backgroundDawn,
  snow: t.chat.backgroundSnow,
  coast: t.chat.backgroundCoast,
  forest: t.chat.backgroundForest,
};

const MENU_WIDTH_PX = 272;

type MenuPosition = {
  top: number;
  left: number;
  width: number;
};

type Props = {
  value: ChatBackgroundPresetId;
  onChange: (id: ChatBackgroundPresetId) => void;
};

export default function ChatBackgroundPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(MENU_WIDTH_PX, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    const estimatedHeight = 280;
    const belowTop = rect.bottom + 8;
    const aboveTop = rect.top - estimatedHeight - 8;
    const top =
      belowTop + estimatedHeight > window.innerHeight - 8 && aboveTop >= 8
        ? aboveTop
        : Math.min(belowTop, window.innerHeight - estimatedHeight - 8);
    setMenuPosition({ top: Math.max(8, top), left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const menu =
    open && menuPosition ? (
      <BackgroundMenu
        menuRef={menuRef}
        menuPosition={menuPosition}
        value={value}
        onChange={onChange}
        onClose={() => setOpen(false)}
      />
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            if (next) {
              requestAnimationFrame(() => updateMenuPosition());
            }
            return next;
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white/85 px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t.chat.backgroundSettingsAria}
        title={t.chat.backgroundSettings}
      >
        <ImageIcon className="size-3.5 shrink-0 opacity-80" aria-hidden />
        <span className="hidden sm:inline">{PRESET_LABELS[value]}</span>
      </button>
      {mounted && menu ? createPortal(menu, document.body) : null}
    </>
  );
}

function BackgroundMenu({
  menuRef,
  menuPosition,
  value,
  onChange,
  onClose,
}: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPosition: MenuPosition;
  value: ChatBackgroundPresetId;
  onChange: (id: ChatBackgroundPresetId) => void;
  onClose: () => void;
}) {
  return (
    <div
      ref={menuRef}
      role="listbox"
      aria-label={t.chat.backgroundSettings}
      className="fixed z-[200] max-h-[min(70vh,24rem)] overflow-y-auto rounded-2xl border border-slate-200/90 bg-white p-3 shadow-[0_20px_50px_rgba(15,23,42,0.2)]"
      style={{
        top: menuPosition.top,
        left: menuPosition.left,
        width: menuPosition.width,
      }}
    >
      <p className="mb-2 px-0.5 text-[11px] font-medium text-slate-500">{t.chat.backgroundSettings}</p>
      <div className="grid grid-cols-2 gap-2">
        {CHAT_BACKGROUND_PRESETS.map((preset) => {
          const selected = preset.id === value;
          const label = PRESET_LABELS[preset.id];
          return (
            <button
              key={preset.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => {
                onChange(preset.id);
                onClose();
              }}
              className={cn(
                "relative rounded-xl border p-2 text-left transition-colors",
                selected
                  ? "border-primary/50 bg-primary/5 ring-2 ring-primary/25"
                  : "border-slate-200/90 bg-white hover:border-primary/25 hover:bg-slate-50",
              )}
            >
              <span
                className={cn("mb-2 block h-12 w-full rounded-lg border border-black/5", preset.previewClass)}
                aria-hidden
              />
              <span className="flex items-center justify-between gap-1">
                <span className="text-xs font-medium text-slate-800">{label}</span>
                {selected ? <Check className="size-3.5 shrink-0 text-primary" aria-hidden /> : null}
              </span>
              <span className="mt-0.5 block text-[10px] text-slate-500">
                {getChatBackgroundPreset(preset.id).theme === "light"
                  ? t.chat.backgroundThemeLight
                  : t.chat.backgroundThemeDark}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
