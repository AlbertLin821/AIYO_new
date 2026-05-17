import type { TripProfile } from "@/types";

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function applyRevisionInstructionToProfile(
  profile: TripProfile,
  instruction: string,
): TripProfile {
  const next: TripProfile = {
    ...profile,
    special_population: { ...profile.special_population },
    preferences: [...profile.preferences],
    visited_before: [...profile.visited_before],
    avoid_places: [...profile.avoid_places],
    dietary_restrictions: [...profile.dietary_restrictions],
    disliked_activities: [...profile.disliked_activities],
  };

  if (/改成|換成|改走|以/u.test(instruction) && /自駕|租車/u.test(instruction)) {
    next.transportation = "self_drive";
  } else if (/改成|換成|改走|以/u.test(instruction) && /大眾運輸|電車|火車|公車|巴士/u.test(instruction)) {
    next.transportation = "public_transport";
  }

  if (/放慢|輕鬆一點|不要太趕|減少移動|慢活/u.test(instruction)) {
    next.pace = "relaxed";
  } else if (/緊湊|扎實|排滿|多跑幾個點/u.test(instruction)) {
    next.pace = "intensive";
  }

  if (/(加入|增加|多一點|更多).*(美食|小吃|餐廳)|(美食|小吃|餐廳).*(加入|增加|多一點|更多)/u.test(instruction)) {
    next.preferences = uniqueStrings([...next.preferences, "food"]);
  }
  if (/(加入|增加|多一點|更多).*(自然|風景|阿蘇|溫泉)|((自然|風景|阿蘇|溫泉).*(加入|增加|多一點|更多))/u.test(instruction)) {
    next.preferences = uniqueStrings([...next.preferences, "nature"]);
  }
  if (/(加入|增加|多一點|更多).*(古蹟|歷史|神社|寺)|((古蹟|歷史|神社|寺).*(加入|增加|多一點|更多))/u.test(instruction)) {
    next.preferences = uniqueStrings([...next.preferences, "history"]);
  }

  if (/(減少|少一點|不要).*(購物|逛街|商店街)|((購物|逛街|商店街).*(減少|少一點|不要))/u.test(instruction)) {
    next.preferences = next.preferences.filter((item) => item !== "city_walk");
    next.disliked_activities = uniqueStrings([...next.disliked_activities, "shopping"]);
  }

  return next;
}
