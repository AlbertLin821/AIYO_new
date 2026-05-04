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
  folderId?: string | null;
  folderName?: string | null;
  /** 是否為本人擁有的行程（協作行程為 false） */
  isOwner?: boolean;
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

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase("zh-Hant");
}

function formatDateForSearch(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return [
    date.toISOString().slice(0, 10),
    date.toLocaleDateString("zh-TW"),
    date.getFullYear().toString(),
    `${date.getMonth() + 1}/${date.getDate()}`,
  ].join(" ");
}

export function filterItineraries<T extends ItineraryListItem>(
  itineraries: T[],
  query: string,
): T[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return itineraries;
  }

  return itineraries.filter((item) => {
    const searchable = [
      item.title,
      item.destination,
      item.folderName || "",
      `${item.days} 天`,
      formatDateForSearch(item.createdAt),
      formatDateForSearch(item.updatedAt),
    ]
      .join(" ")
      .toLocaleLowerCase("zh-Hant");

    return searchable.includes(normalizedQuery);
  });
}
