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
        messages: [
          {
            role: "system",
            content:
              "你只能輸出繁體中文。禁止使用簡體中文。若必須輸出 JSON，JSON key 必須照 schema 保持不變，但所有可讀文字值都必須使用繁體中文；URL、程式代碼、模型名稱、專有名詞與原文地名可保留原文。",
          },
          ...messages,
        ],
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
