export const CHAT_BACKGROUND_STORAGE_KEY = "aiyo:chat-background-preset";

export type ChatBackgroundTheme = "light" | "dark";

export type ChatBackgroundPresetId = "mist" | "dawn" | "snow" | "coast" | "forest";

export type ChatBackgroundPreset = {
  id: ChatBackgroundPresetId;
  theme: ChatBackgroundTheme;
  imageSrc?: string;
  imageFallback?: string;
  baseClass: string;
  overlayClass?: string;
  previewClass: string;
};

export const CHAT_BACKGROUND_PRESETS: ChatBackgroundPreset[] = [
  {
    id: "mist",
    theme: "light",
    baseClass: "bg-gradient-to-br from-slate-100 via-white to-sky-100",
    previewClass: "bg-gradient-to-br from-slate-100 via-white to-sky-100",
  },
  {
    id: "dawn",
    theme: "light",
    baseClass: "bg-gradient-to-br from-rose-50 via-white to-amber-50",
    previewClass: "bg-gradient-to-br from-rose-50 via-white to-amber-50",
  },
  {
    id: "snow",
    theme: "light",
    baseClass: "bg-gradient-to-br from-slate-50 via-blue-50/70 to-white",
    overlayClass: "bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.9),transparent_55%)]",
    previewClass: "bg-gradient-to-br from-slate-100 via-blue-50 to-white",
  },
  {
    id: "coast",
    theme: "light",
    imageSrc: "/chat-bg-coast.jpg",
    imageFallback:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80",
    baseClass: "bg-gradient-to-br from-sky-200 via-cyan-100 to-sky-50",
    overlayClass: "bg-gradient-to-b from-white/55 via-transparent to-sky-900/25",
    previewClass: "bg-gradient-to-br from-sky-100 to-cyan-200",
  },
  {
    id: "forest",
    theme: "dark",
    imageSrc: "/chat-scenic-bg.jpg",
    imageFallback:
      "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&q=80",
    baseClass: "bg-gradient-to-br from-emerald-950 via-slate-900 to-black",
    overlayClass:
      "bg-gradient-to-br from-emerald-950/50 via-emerald-900/20 to-slate-950/45",
    previewClass: "bg-gradient-to-br from-emerald-900 to-slate-900",
  },
];

const DEFAULT_PRESET_ID: ChatBackgroundPresetId = "mist";

export function getChatBackgroundPreset(id: string): ChatBackgroundPreset {
  return CHAT_BACKGROUND_PRESETS.find((preset) => preset.id === id) ?? getDefaultChatBackgroundPreset();
}

export function getDefaultChatBackgroundPreset(): ChatBackgroundPreset {
  return CHAT_BACKGROUND_PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID)!;
}

export function isChatBackgroundPresetId(value: string): value is ChatBackgroundPresetId {
  return CHAT_BACKGROUND_PRESETS.some((preset) => preset.id === value);
}

export function readChatBackgroundPresetId(): ChatBackgroundPresetId {
  if (typeof window === "undefined") {
    return DEFAULT_PRESET_ID;
  }
  const raw = window.localStorage.getItem(CHAT_BACKGROUND_STORAGE_KEY);
  if (raw && isChatBackgroundPresetId(raw)) {
    return raw;
  }
  return DEFAULT_PRESET_ID;
}

export function persistChatBackgroundPresetId(id: ChatBackgroundPresetId): void {
  window.localStorage.setItem(CHAT_BACKGROUND_STORAGE_KEY, id);
}
