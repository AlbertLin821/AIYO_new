import { z } from "zod";

const entityId = z.string().min(1).max(100);
const dayNumber = z.number().int().min(1).max(60);
const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const agentMoveOperationSchema = z.strictObject({ type: z.literal("move_item"), itemId: entityId, toDay: dayNumber, afterItemId: entityId.nullable(), time: localTime.optional() });

export const agentOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("remove_item"), itemId: entityId }),
  agentMoveOperationSchema,
  z.strictObject({ type: z.literal("replace_item"), itemId: entityId, placeId: entityId, time: localTime }),
  z.strictObject({ type: z.literal("add_item"), day: dayNumber, placeId: entityId, time: localTime, afterItemId: entityId.nullable() }),
]);

export const agentProposalSchema = z.strictObject({
  version: z.literal(1),
  operations: z.array(agentOperationSchema).min(1).max(12),
  explanation: z.string().max(1200),
});

export const previewRequestSchema = z.strictObject({
  instruction: z.string().trim().min(2).max(2000),
  baseRevision: z.number().int().min(0),
  selectedEntityIds: z.array(entityId).max(20).optional(),
});

export const previewTimeAdjustmentSchema = z.strictObject({
  operationIndex: z.number().int().min(0).max(11),
  time: localTime,
});

export const previewPlaceAdjustmentSchema = z.strictObject({
  operationIndex: z.number().int().min(0).max(11),
  query: z.string().trim().min(2).max(120),
});

export const mutationRequestSchema = z.strictObject({
  baseRevision: z.number().int().min(0),
  idempotencyKey: z.string().uuid(),
});

export type AgentOperation = z.infer<typeof agentOperationSchema>;
export type AgentProposal = z.infer<typeof agentProposalSchema>;
