import { serverConfig } from "@/server/config";

type Mem0Message = {
  role: "user" | "assistant";
  content: string;
};

type Mem0SearchResult = {
  id: string;
  memory: string;
  score?: number;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
};

export type Mem0MemoryRecord = {
  id: string;
  memory: string;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  metadata?: Record<string, unknown> | null;
  score?: number;
  created_at?: string;
  updated_at?: string;
};

export class Mem0RequestError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = "Mem0RequestError";
  }
}

async function mem0Fetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), serverConfig.mem0TimeoutMs);

  try {
    const response = await fetch(`${serverConfig.mem0BaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Mem0RequestError(`Mem0 request failed with status ${response.status}`, text);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Mem0RequestError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new Mem0RequestError("Mem0 request timed out");
    }
    throw new Mem0RequestError("Failed to reach Mem0", error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchMemories(input: {
  userId: string;
  query: string;
  topK?: number;
}): Promise<Mem0SearchResult[]> {
  if (!serverConfig.mem0Enabled || !input.query.trim()) {
    return [];
  }

  const payload = await mem0Fetch<{ results?: Mem0SearchResult[] }>("/search", {
    method: "POST",
    body: JSON.stringify({
      query: input.query,
      filters: { user_id: input.userId },
      top_k: input.topK ?? serverConfig.mem0TopK,
    }),
  });

  return payload.results || [];
}

export async function addMemories(input: {
  userId: string;
  messages: Mem0Message[];
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!serverConfig.mem0Enabled || !input.messages.length) {
    return;
  }

  await mem0Fetch("/memories", {
    method: "POST",
    body: JSON.stringify({
      user_id: input.userId,
      messages: input.messages,
      metadata: input.metadata,
    }),
  });
}

export async function listMemories(userId: string): Promise<Mem0MemoryRecord[]> {
  if (!serverConfig.mem0Enabled || !userId) {
    return [];
  }

  const params = new URLSearchParams({ user_id: userId });
  const payload = await mem0Fetch<{ results?: Mem0MemoryRecord[] }>(`/memories?${params.toString()}`);
  return payload.results || [];
}

export async function getMemory(memoryId: string): Promise<Mem0MemoryRecord | null> {
  if (!serverConfig.mem0Enabled || !memoryId) {
    return null;
  }

  return mem0Fetch<Mem0MemoryRecord>(`/memories/${memoryId}`);
}

export async function updateMemory(input: {
  memoryId: string;
  text: string;
  metadata?: Record<string, unknown> | null;
}): Promise<Mem0MemoryRecord> {
  return mem0Fetch<Mem0MemoryRecord>(`/memories/${input.memoryId}`, {
    method: "PUT",
    body: JSON.stringify({
      text: input.text,
      metadata: input.metadata,
    }),
  });
}

export async function deleteMemory(memoryId: string): Promise<void> {
  await mem0Fetch(`/memories/${memoryId}`, {
    method: "DELETE",
  });
}

export function formatMemoryContext(results: Mem0SearchResult[]): string | undefined {
  const lines = results
    .map((result) => result.memory?.trim())
    .filter(Boolean)
    .slice(0, serverConfig.mem0TopK);

  if (!lines.length) {
    return undefined;
  }

  return lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
}
