import type { ItineraryFolderDto } from "@/services/itineraryClient";

export function normalizeFolderNameForCompare(name: string): string {
  return name.trim().toLocaleLowerCase("zh-TW");
}

export function isFolderNameDuplicate(
  folders: Pick<ItineraryFolderDto, "id" | "name">[],
  name: string,
  excludeFolderId?: string,
): boolean {
  const target = normalizeFolderNameForCompare(name);
  if (!target) {
    return false;
  }
  return folders.some(
    (folder) =>
      folder.id !== excludeFolderId &&
      normalizeFolderNameForCompare(folder.name) === target,
  );
}
