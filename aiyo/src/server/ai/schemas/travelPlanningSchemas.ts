import { z } from "zod";

export const questionCardSlotValues = [
  "destination",
  "duration_days",
  "duration_nights",
  "departure_location",
  "travel_dates",
  "companions",
  "traveler_count",
  "budget",
  "preferences",
  "transportation",
  "accommodation",
  "visited_before",
  "avoid_places",
  "dietary_restrictions",
  "disliked_activities",
  "pace",
  "plan_integration",
  "special_needs",
] as const;

export const questionCardTypeValues = [
  "single_choice",
  "multi_choice",
  "text",
  "number",
  "date_range",
  "budget",
] as const;

export const canonicalQuestionOptionValues = {
  companions: ["solo", "couple_or_friend", "small_group", "family_group"],
  pace: ["relaxed", "normal", "moderate", "intensive"],
  plan_integration: ["direct_merge", "self_merge"],
  transportation: ["public_transport", "self_drive", "charter_or_tour", "ai_recommend"],
  special_needs: ["elderly", "children", "mobility_issue", "dietary_restriction", "none"],
} as const;

export const ChatQuestionOptionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(80),
  recommended: z.boolean().optional(),
});

export const ChatQuestionSchema = z.object({
  slot: z.enum(questionCardSlotValues),
  question: z.string().trim().min(1).max(160),
  type: z.enum(questionCardTypeValues),
  options: z.array(ChatQuestionOptionSchema).max(8).optional(),
  placeholder: z.string().trim().max(100).optional(),
  helperText: z.string().trim().max(140).optional(),
  startLabel: z.string().trim().max(40).optional(),
  endLabel: z.string().trim().max(40).optional(),
});

export const QuestionCardPayloadSchema = z.object({
  response_type: z.literal("question_card"),
  title: z.string().trim().min(1).max(120),
  eyebrow: z.string().trim().max(40).optional(),
  description: z.string().trim().max(180).optional(),
  questions: z.array(ChatQuestionSchema).min(1).max(4),
  action: z
    .object({
      label: z.string().trim().min(1).max(40),
      shortcut: z.string().trim().max(20).optional(),
    })
    .optional(),
});

export const TripProfileSchema = z.object({
  destination: z.string().nullable(),
  duration_days: z.number().int().positive().nullable(),
  duration_nights: z.number().int().nonnegative().nullable(),
  departure_location: z.string().nullable(),
  travel_dates: z.object({ start: z.string(), end: z.string() }).nullable(),
  companions: z.string().nullable(),
  traveler_count: z.number().int().positive().nullable(),
  budget: z.string().nullable(),
  special_population: z.object({
    has_elderly: z.boolean(),
    has_children: z.boolean(),
    mobility_issue: z.boolean(),
  }),
  preferences: z.array(z.string()),
  transportation: z.string().nullable(),
  accommodation: z.string().nullable(),
  visited_before: z.array(z.string()),
  avoid_places: z.array(z.string()),
  dietary_restrictions: z.array(z.string()),
  disliked_activities: z.array(z.string()),
  pace: z.string().nullable(),
  plan_integration: z.enum(["direct_merge", "self_merge"]).nullable().optional(),
});

export const TravelResearchToolRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("search_place"),
    query: z.string().trim().min(1).max(180),
    locationHint: z.string().trim().max(120).optional(),
  }),
  z.object({
    type: z.literal("tavily_search"),
    query: z.string().trim().min(1).max(180),
  }),
  z.object({
    type: z.literal("weather_forecast"),
    destination: z.string().trim().max(120).optional(),
    startDate: z.string().trim().max(20).optional(),
    endDate: z.string().trim().max(20).optional(),
  }),
]);

export const AiProposedChangeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add_itinerary_item"),
    day: z.number().int().positive(),
    time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
    title: z.string().trim().min(1),
    locationName: z.string().trim().optional(),
    transport: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    reason: z.string().trim().optional(),
  }),
  z.object({
    type: z.literal("update_itinerary_item"),
    day: z.number().int().positive().optional(),
    itemId: z.string().trim().optional(),
    targetTitle: z.string().trim().optional(),
    time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
    title: z.string().trim().optional(),
    locationName: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    transport: z.string().trim().optional(),
    reason: z.string().trim().optional(),
  }),
  z.object({
    type: z.literal("remove_itinerary_item"),
    day: z.number().int().positive().optional(),
    itemId: z.string().trim().optional(),
    targetTitle: z.string().trim().optional(),
    reason: z.string().trim().optional(),
  }),
  z.object({
    type: z.literal("remove_itinerary_day"),
    day: z.number().int().positive(),
    reason: z.string().trim().optional(),
  }),
]);

export const StructuredChatOutputSchema = z.object({
  replyText: z.string().trim(),
  proposedChanges: z.array(AiProposedChangeSchema),
});

const LocationReferenceSchema = z.object({
  name: z.string().trim().min(1),
  lat: z.number(),
  lng: z.number(),
  description: z.string().trim().min(1),
  address: z.string().trim().optional(),
});

export const TripPlanResultSchema = z.object({
  summary: z.string().trim().min(1),
  days: z.array(
    z.object({
      dayNumber: z.number().int().positive(),
      theme: z.string().trim().optional(),
      summary: z.string().trim().optional(),
      items: z.array(
        z.object({
          id: z.string().trim().min(1),
          time: z.string().regex(/^\d{2}:\d{2}$/),
          title: z.string().trim().min(1),
          type: z.enum(["attraction", "restaurant", "transport", "hotel", "activity", "shopping"]),
          transport: z.string().trim().optional(),
          notes: z.string().trim().optional(),
          location: LocationReferenceSchema.optional(),
          estimatedCost: z.number().optional(),
          sourceTitle: z.string().trim().optional(),
          sourceUrl: z.string().trim().url().optional(),
          sourceSnippet: z.string().trim().optional(),
          confidence: z.enum(["high", "medium", "low"]).optional(),
        }),
      ),
    }),
  ),
  warnings: z.array(z.string()).optional(),
});

const CitationTextSchema = z.object({
  text: z.string().trim().min(1),
  citations: z.array(z.string().trim().min(1)).optional(),
});

const TravelPlanResponseSourceSchema = z.object({
  source_id: z.string().trim().min(1),
  type: z.enum(["web", "youtube", "weather", "official", "other"]),
  provider: z.string().trim().min(1),
  title: z.string().trim().min(1),
  url: z.string().trim().min(1),
  domain: z.string().trim(),
  favicon: z.string().trim().optional(),
  snippet: z.string().trim(),
  preview_text: z.string().trim(),
  thumbnail: z.string().trim().optional(),
  published_at: z.string().nullable().optional(),
  retrieved_at: z.string().trim().min(1),
  reliability: z.enum(["high", "medium", "low"]),
  language: z.string().trim().optional(),
});

export const TravelPlanResponseSchema = z.object({
  response_type: z.literal("travel_plan"),
  title: z.string().trim().min(1),
  summary: z.string().trim().optional(),
  citations: z.array(z.string().trim().min(1)).optional(),
  revision: z.unknown().optional(),
  sources: z.record(z.string(), TravelPlanResponseSourceSchema).optional(),
  summary_table: z.array(
    z.object({
      day: z.string().trim().min(1),
      main_route: z.string().trim().min(1),
      citations: z.array(z.string().trim().min(1)).optional(),
    }),
  ),
  days: z.array(
    z.object({
      day: z.string().trim().min(1),
      theme: z.string().trim().min(1),
      citations: z.array(z.string().trim().min(1)).optional(),
      transportation: z.array(CitationTextSchema),
      spots: z.array(
        z.object({
          name: z.string().trim().min(1),
          feature: z.string().trim().min(1),
          citations: z.array(z.string().trim().min(1)).optional(),
        }),
      ),
      food_recommendations: z.array(
        z.object({
          name: z.string().trim().min(1),
          description: z.string().trim().min(1),
          citations: z.array(z.string().trim().min(1)).optional(),
        }),
      ),
      tips: z.array(CitationTextSchema),
    }),
  ),
  weather_alerts: z.array(
    z.object({
      day: z.string().trim().min(1),
      message: z.string().trim().min(1),
      citations: z.array(z.string().trim().min(1)).optional(),
    }),
  ),
  event_alerts: z.array(
    z.object({
      day: z.string().trim().optional(),
      message: z.string().trim().min(1),
      citations: z.array(z.string().trim().min(1)).optional(),
    }),
  ),
  assumptions: z.array(CitationTextSchema),
});

export const questionCardJsonSchema = z.toJSONSchema(QuestionCardPayloadSchema) as Record<string, unknown>;
export const tripProfileJsonSchema = z.toJSONSchema(TripProfileSchema) as Record<string, unknown>;
export const travelResearchToolRequestJsonSchema = z.toJSONSchema(
  z.object({
    phase: z.literal("research"),
    toolRequests: z.array(TravelResearchToolRequestSchema).max(6),
  }),
) as Record<string, unknown>;
export const structuredChatOutputJsonSchema = z.toJSONSchema(StructuredChatOutputSchema) as Record<string, unknown>;
export const tripPlanResultJsonSchema = z.toJSONSchema(TripPlanResultSchema) as Record<string, unknown>;
export const travelPlanResponseJsonSchema = z.toJSONSchema(TravelPlanResponseSchema) as Record<string, unknown>;
