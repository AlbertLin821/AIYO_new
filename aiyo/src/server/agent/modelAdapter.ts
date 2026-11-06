import { chatWithOllama } from "@/server/ai/ollamaClient";
import { z } from "zod";
import { extractJsonBlock } from "@/server/ai/responseParser";
import { tripDayDate } from "@/lib/tripDate";
import type { PersistedTripPayload } from "@/types";
import { agentMoveOperationSchema, agentProposalSchema, type AgentProposal } from "./schemas";

const moveOnlyProposalSchema = z.strictObject({
  version: z.literal(1),
  operations: z.array(agentMoveOperationSchema).min(1).max(12),
  explanation: z.string().max(1200),
});

export function requiresMoveOnlyProposal(instruction: string): boolean {
  return /(?:移到|移至|搬到|搬至|挪到|挪至)/u.test(instruction)
    && !/(?:新增|加入|加上|替換|換成|改成|刪除|移除|取消)/u.test(instruction);
}

function minuteOfDay(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function asLocalTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function normalizeMoveProposalTimes(proposal: AgentProposal, trip: PersistedTripPayload, instruction: string): AgentProposal {
  if (proposal.operations.length !== 1 || /\b\d{1,2}:\d{2}\b|上午|下午|傍晚|晚上|清晨/u.test(instruction)) return proposal;
  const operation = proposal.operations[0];
  if (operation.type !== "move_item") return proposal;
  const day = trip.itinerary.find((candidate) => candidate.dayNumber === operation.toDay);
  if (!day) return proposal;
  const items = day.items.filter((item) => item.id !== operation.itemId);
  const anchorIndex = operation.afterItemId === null ? -1 : items.findIndex((item) => item.id === operation.afterItemId);
  if (operation.afterItemId !== null && anchorIndex < 0) return proposal;
  const previous = anchorIndex >= 0 ? minuteOfDay(items[anchorIndex].time) : null;
  const next = items[anchorIndex + 1] ? minuteOfDay(items[anchorIndex + 1].time) : null;
  const selected = minuteOfDay(operation.time || trip.itinerary.flatMap((candidate) => candidate.items).find((item) => item.id === operation.itemId)?.time || "");
  if (selected !== null && (previous === null || selected > previous) && (next === null || selected < next)) return proposal;
  let replacement: number | null = null;
  if (previous !== null && next !== null && next - previous >= 60) {
    replacement = Math.min(previous + 60, Math.floor((previous + next) / 2));
  } else if (previous !== null && !items[anchorIndex + 1] && previous <= 22 * 60 + 59) {
    replacement = Math.min(previous + 60, 23 * 60 + 59);
  } else if (next !== null && anchorIndex < 0 && next >= 60) {
    replacement = Math.max(0, next - 60);
  }
  if (replacement === null || (previous !== null && replacement <= previous) || (next !== null && replacement >= next)) return proposal;
  return { ...proposal, operations: [{ ...operation, time: asLocalTime(replacement) }] };
}

export async function proposeAgentOperations(
  instruction: string,
  trip: PersistedTripPayload,
  selectedEntityIds: string[],
): Promise<AgentProposal> {
  const moveOnly = requiresMoveOnlyProposal(instruction);
  const selectedIds = new Set(selectedEntityIds);
  const context = trip.itinerary.map((day) => ({
    day: day.dayNumber,
    date: tripDayDate(trip.startDate, day.dayNumber),
    items: day.items.map((item) => ({ id: item.id, time: item.time, title: item.title, placeId: item.location?.placeId || null })),
  }));
  const messages = [
    { role: "system" as const, content: `你是行程編輯器。只回傳合法 JSON，version 必須為 1，operations 至少一個。${moveOnly ? `這次只允許 move_item；itemId 必須是${selectedIds.size ? "被選取的" : "行程中"}現有項目 ID，不能替換或新增地點。` : "每個操作的 type 僅能是 remove_item、move_item、replace_item、add_item；不要使用 move、update 或其他同義詞。"}移動範例：{\"version\":1,\"operations\":[{\"type\":\"move_item\",\"itemId\":\"現有項目ID\",\"toDay\":2,\"afterItemId\":\"第二天現有項目ID\",\"time\":\"09:00\"}],\"explanation\":\"移至第二天上午\"}。搬移後若原時間與新順序不符，必須提供新的 time。placeId 可填精確景點名稱供伺服器查核；不得虛構地點或 ID。時間格式 HH:mm。最多 12 個操作。` },
    { role: "user" as const, content: JSON.stringify({ instruction, destination: trip.destination, days: context, selectedEntityIds }) },
  ];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await chatWithOllama({ messages, task: "travel-chat", format: z.toJSONSchema(moveOnly ? moveOnlyProposalSchema : agentProposalSchema) as Record<string, unknown>, timeoutMs: 20_000, options: { temperature: 0, num_ctx: 4096 } });
    const block = extractJsonBlock(raw);
    if (block) {
      try {
        const parsed = agentProposalSchema.safeParse(JSON.parse(block));
        if (parsed.success && (!moveOnly || parsed.data.operations.every((operation) => operation.type === "move_item" && (!selectedIds.size || selectedIds.has(operation.itemId))))) {
          return moveOnly ? normalizeMoveProposalTimes(parsed.data, trip, instruction) : parsed.data;
        }
        if (parsed.success) console.info("[agent-preview] proposal_validation", { attempt, issue: "move_intent_mismatch" });
        else console.info("[agent-preview] proposal_validation", { attempt, issuePaths: parsed.error.issues.map((issue) => issue.path.join(".")).slice(0, 8) });
      } catch { console.info("[agent-preview] proposal_validation", { attempt, issue: "json_invalid" }); }
    } else {
      console.info("[agent-preview] proposal_validation", { attempt, issue: "json_missing" });
    }
    messages.push({ role: "user", content: moveOnly
      ? `上一個提案不符合搬移指令。只輸出 move_item；itemId 必須是 ${selectedEntityIds.join("、") || "現有項目 ID"}，toDay 是目標天數，afterItemId 是目標天已存在的項目 ID 或 null。`
      : "上一個 JSON 不符合操作 schema。請只回傳合法 JSON，無法確定時 operations 為空陣列。" });
  }
  throw new Error("invalid_agent_proposal");
}
