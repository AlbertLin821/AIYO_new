import { randomUUID } from "node:crypto";
import { isDestructiveItineraryCommand } from "@/lib/chat/workflowRailVisibility";
import type { AssistantAction, ChatContext, ChatResponsePayload } from "@/types";

type PendingDestructiveConfirmation = {
  token: string;
  userId: string;
  tripId: string | null;
  action: string;
  target: string;
  actions: AssistantAction[];
  expiresAt: number;
};

const CONFIRMATION_TTL_MS = 10 * 60 * 1000;
const pendingConfirmations = new Map<string, PendingDestructiveConfirmation>();

function confirmationKey(userId: string, tripId: string | null) {
  return `${userId}:${tripId || "no-trip"}`;
}

function normalizeMessage(message: string) {
  return message.trim().replace(/\s+/g, " ");
}

function isCancelMessage(message: string) {
  return /^(?:取消|不要了|算了|不用了|先不要|否|不要)[，,。！!\s]*$/u.test(normalizeMessage(message));
}

function compact(value: string) {
  return value.replace(/\s+/g, "");
}

function isConfirmMessage(message: string) {
  return /^(?:確認|確定|是的|對|好|好，清空|請執行|執行|刪除|清空|確認清空|確認刪除).*$/u.test(
    normalizeMessage(message),
  );
}

function parseTargetDayNumber(message: string): number | null {
  const normalized = normalizeMessage(message);
  const dayMatch = normalized.match(/(?:第?\s*([\d一二兩两三四五六七八九十]+)\s*天|day\s*(\d+))/iu);
  if (dayMatch) {
    const raw = dayMatch[1] || dayMatch[2] || "";
    const digit = Number(raw);
    if (Number.isFinite(digit) && digit > 0) {
      return digit;
    }
    const map: Record<string, number> = {
      一: 1,
      二: 2,
      兩: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
    };
    return map[raw] || null;
  }
  return null;
}

function describeTarget(message: string) {
  const normalized = normalizeMessage(message);
  const dayNumber = parseTargetDayNumber(normalized);
  if (dayNumber) {
    return `第 ${dayNumber} 天`;
  }
  if (/東京/u.test(normalized)) {
    return "東京行程";
  }
  return /整份|整個|全部/u.test(normalized) ? "整份行程" : "指定行程內容";
}

function buildConfirmationReply(entry: PendingDestructiveConfirmation): ChatResponsePayload {
  return {
    reply: {
      id: `assistant_destructive_confirmation_${entry.token}`,
      role: "assistant",
      content: `這是破壞性操作，會刪除「${entry.target}」中的既有安排。請明確回覆「確認${entry.action} ${entry.target}」才會執行；若回覆「取消、不要了、算了」我不會修改行程。`,
      timestamp: new Date().toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      responseType: "text_message",
      assistantActions: [],
      metadata: {
        destructiveConfirmation: {
          token: entry.token,
          action: entry.action,
          target: entry.target,
          expiresAt: new Date(entry.expiresAt).toISOString(),
        },
      },
    },
    assistantActions: [],
    proposedChanges: [],
  };
}

function buildConfirmedReply(entry: PendingDestructiveConfirmation): ChatResponsePayload {
  const count = entry.actions.length;
  return {
    reply: {
      id: `assistant_destructive_applied_${Date.now()}`,
      role: "assistant",
      content:
        count > 0
          ? `已確認，將${entry.action}「${entry.target}」中的 ${count} 個既有項目。`
          : `已確認，但目前「${entry.target}」沒有可刪除的項目。`,
      timestamp: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }),
      responseType: "text_message",
      assistantActions: entry.actions,
      metadata: {
        destructiveConfirmation: {
          token: entry.token,
          action: entry.action,
          target: entry.target,
          confirmed: true,
        },
      },
    },
    assistantActions: entry.actions,
    proposedChanges: [],
  };
}

function buildDestructiveActions(input: { message: string; context?: ChatContext }): AssistantAction[] {
  const dayNumber = parseTargetDayNumber(input.message);
  if (!dayNumber) {
    return (input.context?.itinerary || []).flatMap((day) =>
      day.items.map((item) => ({
        type: "itinerary.remove_item" as const,
        payload: {
          dayId: `day-${day.dayNumber}`,
          itemId: item.id,
        },
      })),
    );
  }
  const day = input.context?.itinerary?.find((candidate) => candidate.dayNumber === dayNumber);
  return (day?.items || []).map((item) => ({
    type: "itinerary.remove_item",
    payload: {
      dayId: `day-${dayNumber}`,
      itemId: item.id,
    },
  }));
}

export function guardDestructiveChatMessage(input: {
  userId: string | null;
  tripId?: string | null;
  message: string;
  context?: ChatContext;
}): { kind: "continue"; confirmationToken?: string } | { kind: "respond"; response: ChatResponsePayload } {
  const userId = input.userId;
  const tripId = input.tripId || null;
  const message = normalizeMessage(input.message);
  if (!userId || !message) {
    return { kind: "continue" };
  }

  const key = confirmationKey(userId, tripId);
  const existing = pendingConfirmations.get(key);
  if (existing && existing.expiresAt <= Date.now()) {
    pendingConfirmations.delete(key);
  }

  if (isCancelMessage(message)) {
    pendingConfirmations.delete(key);
    return {
      kind: "respond",
      response: {
        reply: {
          id: `assistant_destructive_cancel_${Date.now()}`,
          role: "assistant",
          content: "已取消，沒有修改行程。",
          timestamp: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }),
          responseType: "text_message",
          assistantActions: [],
        },
        assistantActions: [],
        proposedChanges: [],
      },
    };
  }

  const pending = pendingConfirmations.get(key);
  if (pending && isConfirmMessage(message) && compact(message).includes(compact(pending.target))) {
    pendingConfirmations.delete(key);
    return { kind: "respond", response: buildConfirmedReply(pending) };
  }

  if (!isDestructiveItineraryCommand(message)) {
    return { kind: "continue" };
  }

  const target = describeTarget(message);
  const action = /刪除|刪掉|移除|取消|去掉/u.test(message) ? "刪除" : "清空";
  const entry: PendingDestructiveConfirmation = {
    token: randomUUID(),
    userId,
    tripId,
    action,
    target,
    actions: buildDestructiveActions({ message, context: input.context }),
    expiresAt: Date.now() + CONFIRMATION_TTL_MS,
  };
  pendingConfirmations.set(key, entry);
  return { kind: "respond", response: buildConfirmationReply(entry) };
}
