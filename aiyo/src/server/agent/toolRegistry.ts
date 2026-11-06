import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { mapService } from "@/server/maps/service";
import { serializeTrip } from "@/server/data/appStateService";
import { requireTripAccess } from "@/server/tripAccess";
import type { MapRoute } from "@/server/maps/types";
import type { PersistedTripPayload } from "@/types";
import { agentProposalSchema, type AgentProposal } from "./schemas";
import { planAgentPreview, type AgentPreviewResult, type VerifiedAgentPlace } from "./previewPlanner";
import { validatePreviewTravel } from "./previewTravelValidation";
import { resolveAgentPlaceCandidate, resolveProposalPlaces } from "./readTools";

const pointSchema = z.strictObject({ lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180) });
const placeSchema = z.object({
  id: z.string().min(1), title: z.string().min(1),
  location: z.object({ name: z.string().min(1), lat: z.number().finite(), lng: z.number().finite(), verified: z.literal(true) }),
});
const tripSchema = z.object({ tripId: z.string().min(1), revision: z.number().int().min(0), destination: z.string(), itinerary: z.array(z.object({ dayNumber: z.number().int(), items: z.array(z.object({ id: z.string() })) })), pins: z.array(z.unknown()) });
const previewSchema = z.object({ trip: tripSchema, changes: z.array(z.object({ type: z.string(), itemId: z.string() })), warnings: z.array(z.string()) });

type ToolName = "read_trip" | "search_verified_places" | "get_place_details" | "estimate_route" | "validate_schedule";
type ToolDefinition = {
  input: z.ZodType;
  output: z.ZodType;
  maxCalls: number;
  timeoutMs: number;
  source: "database" | "osm" | "osrm" | "planner";
  run: (input: never) => Promise<unknown>;
};

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("agent_tool_timeout")), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createAgentToolRegistry(userId: string, tripId: string) {
  let trip: PersistedTripPayload | null = null;
  const verifiedPlaces = new Map<string, VerifiedAgentPlace>();
  const counts = new Map<ToolName, number>();
  const definitions: Record<ToolName, ToolDefinition> = {
    read_trip: {
      input: z.strictObject({}), output: tripSchema, maxCalls: 1, timeoutMs: 10_000, source: "database",
      run: async () => {
        const record = await prisma.trip.findUnique({ where: { id: tripId }, include: { itineraryDays: true, items: true, pins: true } });
        if (!record) throw new Error("not_found");
        trip = serializeTrip(record);
        return trip;
      },
    },
    search_verified_places: {
      input: z.strictObject({ proposal: agentProposalSchema, instruction: z.string().trim().min(2).max(2000) }),
      output: z.object({ proposal: agentProposalSchema, places: z.array(placeSchema).max(4) }),
      maxCalls: 1, timeoutMs: 30_000, source: "osm",
      run: async (value: { proposal: AgentProposal; instruction: string }) => {
        if (!trip) throw new Error("trip_context_missing");
        const resolved = await resolveProposalPlaces(value.proposal, trip.destination, value.instruction);
        for (const place of resolved.places.values()) verifiedPlaces.set(place.id, place);
        return { proposal: resolved.proposal, places: [...resolved.places.values()] };
      },
    },
    get_place_details: {
      input: z.strictObject({ query: z.string().trim().min(2).max(120) }), output: placeSchema,
      maxCalls: 4, timeoutMs: 25_000, source: "osm",
      run: async (value: { query: string }) => {
        if (!trip) throw new Error("trip_context_missing");
        const place = await resolveAgentPlaceCandidate(value.query, trip.destination);
        verifiedPlaces.set(place.id, place);
        return place;
      },
    },
    estimate_route: {
      input: z.strictObject({ points: z.array(pointSchema).min(2).max(6), profile: z.enum(["driving", "walking", "cycling"]).optional() }),
      output: z.object({
        durationSeconds: z.number().finite().nonnegative(), distanceMeters: z.number().finite().nonnegative(),
        geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(z.tuple([z.number().finite(), z.number().finite()])) }),
      }),
      maxCalls: 8, timeoutMs: 12_000, source: "osrm",
      run: async (value: { points: Array<{ lat: number; lng: number }>; profile?: "driving" | "walking" | "cycling" }) => mapService.getRoute(value.points, value.profile || "driving"),
    },
    validate_schedule: {
      input: z.strictObject({ proposal: agentProposalSchema }),
      output: previewSchema, maxCalls: 2, timeoutMs: 30_000, source: "planner",
      run: async (value: { proposal: AgentProposal }) => {
        if (!trip) throw new Error("trip_context_missing");
        return validatePreviewTravel(
          trip,
          planAgentPreview(trip, value.proposal, verifiedPlaces),
          (points, profile) => call<MapRoute>("estimate_route", { points, profile }),
        );
      },
    },
  };

  async function call<T>(name: string, input: unknown): Promise<T> {
    if (!Object.prototype.hasOwnProperty.call(definitions, name)) throw new Error("unknown_agent_tool");
    const tool = name as ToolName;
    const definition = definitions[tool];
    const parsed = definition.input.safeParse(input);
    if (!parsed.success) throw new Error("invalid_agent_tool_input");
    const count = counts.get(tool) || 0;
    if (count >= definition.maxCalls) throw new Error("agent_tool_limit");
    counts.set(tool, count + 1);
    await requireTripAccess(userId, tripId, "view");
    const started = Date.now();
    try {
      const result = await withTimeout(definition.run(parsed.data as never), definition.timeoutMs);
      if (!definition.output.safeParse(result).success) throw new Error("invalid_agent_tool_output");
      console.info("[agent-tool]", { name: tool, source: definition.source, status: "ok", durationMs: Date.now() - started });
      return result as T;
    } catch (error) {
      console.warn("[agent-tool]", { name: tool, source: definition.source, status: "failed", durationMs: Date.now() - started, reason: error instanceof Error ? error.message : "unknown" });
      throw error;
    }
  }

  return {
    call,
    readTrip: () => call<PersistedTripPayload>("read_trip", {}),
    searchVerifiedPlaces: (proposal: AgentProposal, instruction: string) => call<{ proposal: AgentProposal; places: VerifiedAgentPlace[] }>("search_verified_places", { proposal, instruction }),
    getPlaceDetails: (query: string) => call<VerifiedAgentPlace>("get_place_details", { query }),
    estimateRoute: (points: Array<{ lat: number; lng: number }>, profile?: "driving" | "walking" | "cycling") => call<MapRoute>("estimate_route", { points, profile }),
    validateSchedule: (proposal: AgentProposal) => call<AgentPreviewResult>("validate_schedule", { proposal }),
  };
}
