export type ItinerarySortOption =
  | "updatedAt_desc"
  | "updatedAt_asc"
  | "createdAt_desc"
  | "createdAt_asc"
  | "destination_asc"
  | "destination_desc"
  | "days_asc"
  | "days_desc"
  | "title_asc"
  | "title_desc";

export type ItineraryListItem = {
  id: string;
  title: string;
  destination: string;
  days: number;
  updatedAt: string;
  createdAt: string;
  folderId?: string;
};

function compareString(left: string, right: string) {
  return left.localeCompare(right, "zh-Hant");
}

export function sortItineraries<T extends ItineraryListItem>(
  itineraries: T[],
  option: ItinerarySortOption,
): T[] {
  const [field, direction] = option.split("_") as [keyof ItineraryListItem, "asc" | "desc"];
  const multiplier = direction === "asc" ? 1 : -1;
  return [...itineraries].sort((left, right) => {
    if (field === "days") {
      return (left.days - right.days) * multiplier;
    }
    if (field === "createdAt" || field === "updatedAt") {
      return (Date.parse(left[field]) - Date.parse(right[field])) * multiplier;
    }
    return compareString(String(left[field] || ""), String(right[field] || "")) * multiplier;
  });
}
