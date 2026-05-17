import type { ChatSource } from "@/types";

const SOURCE_TTL_MS = 30 * 60 * 1000;

type StoredSource = {
  source: ChatSource;
  expiresAt: number;
};

const sourceStore = new Map<string, StoredSource>();

export function registerChatSources(sources: Record<string, ChatSource>): void {
  const expiresAt = Date.now() + SOURCE_TTL_MS;
  for (const source of Object.values(sources)) {
    sourceStore.set(source.source_id, { source, expiresAt });
  }
}

export function getChatSourcePreview(sourceId: string): ChatSource | null {
  const stored = sourceStore.get(sourceId);
  if (!stored) {
    return null;
  }
  if (stored.expiresAt <= Date.now()) {
    sourceStore.delete(sourceId);
    return null;
  }
  return stored.source;
}
