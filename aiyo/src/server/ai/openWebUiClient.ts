import { normalizeOllamaResponseContent } from "@/server/ai/ollamaResponseNormalizer";
import {
  OllamaRequestError,
  resolveModelForTask,
  type OllamaMessage,
} from "@/server/ai/ollamaClient";
import { serverConfig } from "@/server/config";

interface OpenWebUiChatOptions {
  messages: OllamaMessage[];
  format?: "json" | Record<string, unknown>;
  model?: string;
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

type OpenWebUiModelEntry = {
  id?: string;
  name?: string;
  model?: string;
};

function buildGatewayUrl(path: string): string {
  const baseUrl = serverConfig.openwebuiBaseUrl.replace(/\/$/, "");
  if (!baseUrl) {
    throw new OllamaRequestError("OPENWEBUI_BASE_URL is missing", undefined, "network_error");
  }
  return `${baseUrl}${path}`;
}

function buildGatewayHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (serverConfig.openwebuiApiKey.trim()) {
    headers.Authorization = `Bearer ${serverConfig.openwebuiApiKey}`;
  }
  return headers;
}

function buildResponseFormat(
  format: OpenWebUiChatOptions["format"],
): Record<string, unknown> | undefined {
  if (!format) {
    return undefined;
  }
  if (format === "json") {
    return { type: "json_object" };
  }
  return {
    type: "json_schema",
    json_schema: {
      name: "structured_response",
      schema: format,
      strict: true,
    },
  };
}

function joinMessageParts(parts: unknown): string | null {
  if (!Array.isArray(parts)) {
    return null;
  }
  const text = parts
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (!part || typeof part !== "object") {
        return "";
      }
      const record = part as Record<string, unknown>;
      if (typeof record.text === "string") {
        return record.text;
      }
      if (record.type === "text" && typeof record.content === "string") {
        return record.content;
      }
      return "";
    })
    .join("")
    .trim();
  return text || null;
}

function extractGatewayContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;

  const directMessage = record.message;
  if (directMessage && typeof directMessage === "object") {
    const content = (directMessage as { content?: unknown }).content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
    const contentParts = joinMessageParts(content);
    if (contentParts) {
      return contentParts;
    }
  }

  const choices = record.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!choice || typeof choice !== "object") {
        continue;
      }
      const message = (choice as { message?: unknown }).message;
      if (!message || typeof message !== "object") {
        continue;
      }
      const content = (message as { content?: unknown }).content;
      if (typeof content === "string" && content.trim()) {
        return content.trim();
      }
      const contentParts = joinMessageParts(content);
      if (contentParts) {
        return contentParts;
      }
    }
  }

  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text.trim();
  }

  return null;
}

function normalizeModelIds(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload
      .map((entry) => {
        if (typeof entry === "string") {
          return entry.trim();
        }
        if (!entry || typeof entry !== "object") {
          return "";
        }
        const model = entry as OpenWebUiModelEntry;
        return (model.id || model.name || model.model || "").trim();
      })
      .filter(Boolean);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["data", "models"]) {
    if (Array.isArray(record[key])) {
      return normalizeModelIds(record[key]);
    }
  }

  return [];
}

export async function chatWithOpenWebUI({
  messages,
  format,
  model,
  timeoutMs,
  options,
  task = "default",
}: OpenWebUiChatOptions): Promise<string> {
  const controller = new AbortController();
  const cap = Math.max(5000, serverConfig.ollamaTimeoutCapMs);
  const effectiveTimeout = Math.min(
    Math.max(5000, timeoutMs ?? serverConfig.ollamaTimeoutMs),
    cap,
  );
  const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const body: Record<string, unknown> = {
      model: resolveModelForTask(task, model),
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "你只能輸出繁體中文。禁止使用簡體中文。若必須輸出 JSON，JSON key 必須照 schema 保持不變，但所有可讀文字值都必須使用繁體中文；URL、模型名稱、專有名詞與原文地名可保留原文。",
        },
        ...messages,
      ],
    };

    if (typeof options?.temperature === "number") {
      body.temperature = options.temperature;
    } else if (format) {
      body.temperature = 0;
    }

    if (typeof options?.top_p === "number") {
      body.top_p = options.top_p;
    } else if (format) {
      body.top_p = 0.9;
    }

    const responseFormat = buildResponseFormat(format);
    if (responseFormat) {
      body.response_format = responseFormat;
    }

    const response = await fetch(buildGatewayUrl("/api/chat/completions"), {
      method: "POST",
      headers: buildGatewayHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new OllamaRequestError(
        `Open WebUI request failed with status ${response.status}`,
        text,
        "http_error",
      );
    }

    const payload = await response.json();
    const content = extractGatewayContent(payload);
    if (!content) {
      throw new OllamaRequestError(
        "Open WebUI response did not include message content",
        payload,
        "empty_response",
      );
    }

    return normalizeOllamaResponseContent(content, format);
  } catch (error) {
    if (error instanceof OllamaRequestError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new OllamaRequestError("Open WebUI request timed out", undefined, "timeout");
    }
    throw new OllamaRequestError("Failed to reach Open WebUI", error, "network_error");
  } finally {
    clearTimeout(timeout);
  }
}

export async function listOpenWebUiModels(timeoutMs = 5000): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  try {
    const response = await fetch(buildGatewayUrl("/api/models"), {
      method: "GET",
      headers: serverConfig.openwebuiApiKey.trim()
        ? { Authorization: `Bearer ${serverConfig.openwebuiApiKey}` }
        : undefined,
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new OllamaRequestError(
        `Open WebUI model listing failed with status ${response.status}`,
        text,
        "http_error",
      );
    }

    return normalizeModelIds(await response.json());
  } catch (error) {
    if (error instanceof OllamaRequestError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new OllamaRequestError("Open WebUI model listing timed out", undefined, "timeout");
    }
    throw new OllamaRequestError("Failed to reach Open WebUI", error, "network_error");
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkOpenWebUiHealth(timeoutMs = 5000): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  try {
    const response = await fetch(buildGatewayUrl("/health"), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
