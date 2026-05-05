import { serverConfig } from "@/server/config";

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatOptions {
  messages: OllamaMessage[];
  format?: "json";
  model?: string;
  task?:
    | "default"
    | "trip-plan"
    | "travel-chat"
    | "video-summary"
    | "video-summary-fast"
    | "video-summary-final"
    | "location-filter";
}

export class OllamaRequestError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = "OllamaRequestError";
  }
}

export function resolveModelForTask(
  task: OllamaChatOptions["task"],
  explicitModel?: string,
): string {
  if (explicitModel?.trim()) {
    return explicitModel.trim();
  }
  if (task === "video-summary-fast" && serverConfig.ollamaFastSummaryModel) {
    return serverConfig.ollamaFastSummaryModel;
  }
  if (task === "video-summary-final" && serverConfig.ollamaFinalSummaryModel) {
    return serverConfig.ollamaFinalSummaryModel;
  }
  if (task === "video-summary" && serverConfig.ollamaSummaryModel) {
    return serverConfig.ollamaSummaryModel;
  }
  if (task === "location-filter" && serverConfig.ollamaLocationModel) {
    return serverConfig.ollamaLocationModel;
  }
  return serverConfig.ollamaModel;
}

export async function chatWithOllama({
  messages,
  format,
  model,
  task = "default",
}: OllamaChatOptions): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), serverConfig.ollamaTimeoutMs);

  try {
    const response = await fetch(`${serverConfig.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolveModelForTask(task, model),
        stream: false,
        format,
        messages,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new OllamaRequestError(
        `Ollama request failed with status ${response.status}`,
        text,
      );
    }

    const payload = (await response.json()) as {
      message?: { content?: string };
    };
    const content = payload.message?.content?.trim();
    if (!content) {
      throw new OllamaRequestError("Ollama response did not include message content");
    }
    return content;
  } catch (error) {
    if (error instanceof OllamaRequestError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new OllamaRequestError("Ollama request timed out");
    }
    throw new OllamaRequestError("Failed to reach Ollama", error);
  } finally {
    clearTimeout(timeout);
  }
}
