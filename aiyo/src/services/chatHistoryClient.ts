import { apiDelete } from "@/services/apiClient";

export async function clearPersistedChatHistoryOnServer(): Promise<void> {
  await apiDelete<{ cleared: number }>("/api/chat/messages");
}
