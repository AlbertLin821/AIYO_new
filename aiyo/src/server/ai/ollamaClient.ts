import { serverConfig } from "@/server/config";
import { normalizeOllamaResponseContent } from "@/server/ai/ollamaResponseNormalizer";

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatOptions {
  messages: OllamaMessage[];
  format?: "json" | Record<string, unknown>;
  model?: string;
  /** 覆寫預設逾時（例如多輪對話單輪較短）。 */
  timeoutMs?: number;
  options?: {
    temperature?: number;
    top_p?: number;
    num_ctx?: number;
  };
  task?:
    | "default"
    | "trip-plan"
    | "travel-chat"
    | "video-summary"
    | "video-summary-fast"
    | "video-summary-final"
    | "location-filter"
    | "video-moment-polish"
    | "video-place-candidate-extract";
}

export class OllamaRequestError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
    readonly code: "timeout" | "http_error" | "empty_response" | "network_error" = "network_error",
  ) {
    super(message);
    this.name = "OllamaRequestError";
  }

  get isTimeout(): boolean {
    return this.code === "timeout";
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
  if (
    (task === "video-summary-final" || task === "video-moment-polish") &&
    serverConfig.ollamaFinalSummaryModel
  ) {
    return serverConfig.ollamaFinalSummaryModel;
  }
  if (task === "video-summary" && serverConfig.ollamaSummaryModel) {
    return serverConfig.ollamaSummaryModel;
  }
  if (task === "location-filter" && serverConfig.ollamaLocationModel) {
    return serverConfig.ollamaLocationModel;
  }
  if (task === "video-place-candidate-extract" && serverConfig.ollamaLocationModel) {
    return serverConfig.ollamaLocationModel;
  }
  if (task === "trip-plan" && serverConfig.ollamaTripPlanModel) {
    return serverConfig.ollamaTripPlanModel;
  }
  if (task === "travel-chat" && serverConfig.ollamaTravelChatModel) {
    return serverConfig.ollamaTravelChatModel;
  }
  return serverConfig.ollamaModel;
}

export function formatOllamaErrorMessage(
  error: OllamaRequestError,
  task: OllamaChatOptions["task"] = "default",
): string {
  const model = resolveModelForTask(task);
  let detail = "";
  if (typeof error.details === "string" && error.details.trim()) {
    detail = error.details.trim().slice(0, 280);
  } else if (error.details !== undefined) {
    try {
      detail = JSON.stringify(error.details).slice(0, 280);
    } catch {
      detail = "";
    }
  }

  const parts = [`Ollama 回應失敗（${error.message}）`];
  if (detail) {
    parts.push(detail);
  }
  if (error.code === "http_error" || error.code === "network_error") {
    parts.push(`使用模型：${model}。請確認 Ollama 已啟動、模型已 pull，或調整 aiyo/.env 的 OLLAMA_MODEL / OLLAMA_TRAVEL_CHAT_MODEL。`);
  }
  return parts.join(" ");
}

export async function chatWithOllama({
  messages,
  format,
  model,
  timeoutMs,
  options,
  task = "default",
}: OllamaChatOptions): Promise<string> {
  const controller = new AbortController();
  const cap = Math.max(5000, serverConfig.ollamaTimeoutCapMs);
  const effectiveTimeout = Math.min(
    Math.max(5000, timeoutMs ?? serverConfig.ollamaTimeoutMs),
    cap,
  );
  const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

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
        options: {
          ...(format ? { temperature: 0, top_p: 0.9 } : {}),
          ...options,
        },
        messages: [
          {
            role: "system",
            content:
              "你只能輸出繁體中文。禁止使用簡體中文。若必須輸出 JSON，JSON key 必須照 schema 保持不變，但所有可讀文字值都必須使用繁體中文；URL、模型名稱、專有名詞與原文地名可保留原文。",
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
        "http_error",
      );
    }

    const payload = (await response.json()) as {
      message?: { content?: string };
    };
    const content = payload.message?.content?.trim();
    if (!content) {
      throw new OllamaRequestError(
        "Ollama response did not include message content",
        undefined,
        "empty_response",
      );
    }
    return normalizeOllamaResponseContent(content, format);
  } catch (error) {
    if (error instanceof OllamaRequestError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new OllamaRequestError("Ollama request timed out", undefined, "timeout");
    }
    throw new OllamaRequestError("Failed to reach Ollama", error, "network_error");
  } finally {
    clearTimeout(timeout);
  }
}
