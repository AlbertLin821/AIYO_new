import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Bike,
  Building2,
  Bus,
  Camera,
  Car,
  Castle,
  Church,
  Coffee,
  Compass,
  Dumbbell,
  FerrisWheel,
  Footprints,
  Gem,
  Heart,
  Landmark,
  Leaf,
  MapPin,
  Moon,
  Mountain,
  Music,
  Palette,
  PartyPopper,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Sun,
  Ticket,
  TrainFront,
  Trees,
  Utensils,
  Waves,
  Zap,
} from "lucide-react";
import { zhTW as t } from "@/locales/zh-TW";
import type { User } from "@/types";

export type InterestOption = {
  value: string;
  label: string;
  icon: LucideIcon;
};

export type TransportOption = {
  value: string;
  label: string;
  icon: LucideIcon;
};

export type PaceOption = {
  value: User["travelPace"];
  label: string;
  desc: string;
  icon: LucideIcon;
};

export const CUSTOM_INTEREST_ICON_OPTIONS: { name: string; icon: LucideIcon }[] = [
  { name: "Star", icon: Star },
  { name: "Heart", icon: Heart },
  { name: "Sparkles", icon: Sparkles },
  { name: "Camera", icon: Camera },
  { name: "Music", icon: Music },
  { name: "Palette", icon: Palette },
  { name: "Compass", icon: Compass },
  { name: "Leaf", icon: Leaf },
  { name: "Ticket", icon: Ticket },
  { name: "Gem", icon: Gem },
];

export const interestOptions: InterestOption[] = [
  { value: "food", label: t.profile.prefFood, icon: Utensils },
  { value: "coffee", label: t.profile.prefCoffee, icon: Coffee },
  { value: "night view", label: t.profile.prefNight, icon: Moon },
  { value: "shopping", label: t.profile.prefShopping, icon: ShoppingBag },
  { value: "museum", label: t.profile.prefMuseum, icon: Landmark },
  { value: "architecture", label: t.profile.prefArchitecture, icon: Building2 },
  { value: "parks", label: t.profile.prefParks, icon: Trees },
  { value: "local neighborhoods", label: t.profile.prefNeighborhoods, icon: MapPin },
  { value: "nature", label: t.profile.prefNature, icon: Mountain },
  { value: "beach", label: t.profile.prefBeach, icon: Waves },
  { value: "hot spring", label: t.profile.prefHotSpring, icon: Sun },
  { value: "hiking", label: t.profile.prefHiking, icon: Footprints },
  { value: "history", label: t.profile.prefHistory, icon: Castle },
  { value: "art", label: t.profile.prefArt, icon: Palette },
  { value: "photography", label: t.profile.prefPhotography, icon: Camera },
  { value: "nightlife", label: t.profile.prefNightlife, icon: Music },
  { value: "local food market", label: t.profile.prefMarket, icon: Store },
  { value: "theme park", label: t.profile.prefThemePark, icon: FerrisWheel },
  { value: "wildlife", label: t.profile.prefWildlife, icon: Leaf },
  { value: "religious", label: t.profile.prefReligious, icon: Church },
  { value: "festival", label: t.profile.prefFestival, icon: PartyPopper },
  { value: "sports", label: t.profile.prefSports, icon: Dumbbell },
  { value: "wellness", label: t.profile.prefWellness, icon: Sparkles },
  { value: "family", label: t.profile.prefFamily, icon: Baby },
  { value: "luxury", label: t.profile.prefLuxury, icon: Gem },
];

export const transportOptions: TransportOption[] = [
  { value: "Driving", label: t.profile.transportDriving, icon: Car },
  { value: "Transit", label: t.profile.transportTransit, icon: TrainFront },
  { value: "Walking", label: t.profile.transportWalking, icon: Footprints },
  { value: "Bicycling", label: t.profile.transportBicycling, icon: Bike },
];

export const paceOptions: PaceOption[] = [
  { value: "relaxed", label: t.profile.paceRelaxed, desc: t.profile.paceRelaxedDesc, icon: Coffee },
  { value: "moderate", label: t.profile.paceModerate, desc: t.profile.paceModerateDesc, icon: Compass },
  { value: "intensive", label: t.profile.paceIntensive, desc: t.profile.paceIntensiveDesc, icon: Zap },
];

const interestOptionMap = new Map(interestOptions.map((opt) => [opt.value, opt]));
const customIconMap = new Map(CUSTOM_INTEREST_ICON_OPTIONS.map((opt) => [opt.name, opt.icon]));

export function normalizePreferredTransport(raw: string): string {
  const u = raw.trim();
  if (["Driving", "Transit", "Walking", "Bicycling"].includes(u)) return u;
  if (/walk/i.test(u)) return "Walking";
  if (/bike|bicycle/i.test(u)) return "Bicycling";
  if (/taxi|car|drive/i.test(u)) return "Driving";
  return "Transit";
}

export function getInterestLabel(value: string): string {
  return interestOptionMap.get(value)?.label ?? value;
}

export function getInterestIcon(value: string, interestIcons?: Record<string, string>): LucideIcon {
  const preset = interestOptionMap.get(value);
  if (preset) return preset.icon;
  const customIconName = interestIcons?.[value];
  if (customIconName && customIconMap.has(customIconName)) {
    return customIconMap.get(customIconName)!;
  }
  return Star;
}

export function getTransportIcon(value: string): LucideIcon {
  const normalized = normalizePreferredTransport(value);
  return transportOptions.find((opt) => opt.value === normalized)?.icon ?? Bus;
}

export function getPaceOption(pace: User["travelPace"]) {
  return paceOptions.find((opt) => opt.value === pace) ?? null;
}

export function isPresetInterest(value: string): boolean {
  return interestOptionMap.has(value);
}
