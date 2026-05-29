import { prisma } from "@/lib/prisma";

function normalizeFolderNameForCompare(name: string): string {
  return name.trim().toLocaleLowerCase("zh-TW");
}

export async function findDuplicateFolderForUser(
  userId: string,
  name: string,
  excludeFolderId?: string,
): Promise<{ id: string } | null> {
  const target = normalizeFolderNameForCompare(name);
  if (!target) {
    return null;
  }
  const folders = await prisma.itineraryFolder.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const match = folders.find(
    (folder) =>
      folder.id !== excludeFolderId &&
      normalizeFolderNameForCompare(folder.name) === target,
  );
  return match ?? null;
}
