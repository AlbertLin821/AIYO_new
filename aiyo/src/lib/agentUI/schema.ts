import { z } from "zod";

const label = z.string().trim().min(1).max(160);
const actionId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const safeSourceUrl = z.url().refine((value) => new URL(value).protocol === "https:");

export const agentUIComponentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("place_card"), actionId, props: z.strictObject({ title: label, category: label.optional(), sourceUrl: safeSourceUrl.optional(), checkedAt: z.iso.datetime().optional() }) }),
  z.strictObject({ kind: z.literal("choice"), actionId, props: z.strictObject({ label, options: z.array(label).min(2).max(6) }) }),
  z.strictObject({ kind: z.literal("date_time"), actionId, props: z.strictObject({ label, day: z.number().int().min(1).max(60), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }) }),
  z.strictObject({ kind: z.literal("form"), actionId, props: z.strictObject({ label, placeholder: z.string().max(120).optional(), value: z.string().max(300).optional() }) }),
  z.strictObject({ kind: z.literal("map_focus"), actionId, props: z.strictObject({ label, lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }) }),
  z.strictObject({ kind: z.literal("itinerary_diff"), actionId, props: z.strictObject({ summary: label, before: z.string().max(240).optional(), after: z.string().max(240).optional() }) }),
  z.strictObject({ kind: z.literal("confirm_button"), actionId, props: z.strictObject({ label }) }),
]);

export const agentUISchema = z.strictObject({ version: z.literal(1), components: z.array(agentUIComponentSchema).max(49) });
export type AgentUI = z.infer<typeof agentUISchema>;
