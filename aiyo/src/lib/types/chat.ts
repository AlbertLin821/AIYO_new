import type { ItineraryPatch } from "./itinerary";
import type { SourceReference } from "./sources";
import type { ToolCallRecord } from "./tools";

export type ChatRole = "user" | "assistant" | "system" | "tool";

export type ChatToolStatus =
  | "idle"
  | "planning"
  | "searching_web"
  | "reading_youtube"
  | "searching_places"
  | "calculating_route"
  | "updating_itinerary"
  | "grounding_sources"
  | "done"
  | "error";

/**
 * Canonical structured chat payload (Onyx-inspired grounding contract).
 * The runtime `ChatMessage` in `@/types` adds UI fields; align `sourceReferences` / `toolCalls` / `itineraryPatch` with this shape.
 */
export type GroundedChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  sources?: SourceReference[];
  toolCalls?: ToolCallRecord[];
  itineraryPatch?: ItineraryPatch;
  metadata?: Record<string, unknown>;
};
