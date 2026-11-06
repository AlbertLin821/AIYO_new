import { geocodePlace } from "@/server/places/geocodePlace";
import { localizedPlaceAlias } from "@/server/places/localizedAliases";
import type { AgentOperation, AgentProposal } from "./schemas";
import type { VerifiedAgentPlace } from "./previewPlanner";

export async function resolveAgentPlaceCandidate(query: string, destination: string): Promise<VerifiedAgentPlace> {
  let result = await geocodePlace({ query, destinationHint: destination });
  const alias = !result.ok ? localizedPlaceAlias(query, destination) : null;
  if (alias) result = await geocodePlace({ query: alias.query, destinationHint: destination });
  if (!result.ok || !result.place.placeId || (result.place.confidence ?? 0) < 0.7) throw new Error("unverified_place");
  const title = alias?.displayName || result.place.placeName;
  return {
    id: result.place.placeId, title,
    location: {
      name: title, lat: result.place.lat, lng: result.place.lng,
      address: result.place.formattedAddress || undefined, description: "", placeId: result.place.placeId,
      openingHours: result.place.openingHours, phoneNumber: result.place.phoneNumber, website: result.place.website,
      resolvedFrom: result.place.provider === "overpass" ? "overpass" : "photon",
      checkedAt: new Date().toISOString(), confidence: result.place.confidence, verified: true,
    },
  };
}

export function explicitPlaceName(instruction: string, operation: AgentOperation): string | null {
  if (operation.type !== "add_item" && operation.type !== "replace_item") return null;
  const pattern = operation.type === "replace_item"
    ? /(?:改成|換成|替換成)\s*([\p{Script=Han}A-Za-z0-9·・]{2,40})/u
    : /(?:加(?:入|上)?|新增)\s*(?:一個|一間|一處)?\s*([\p{Script=Han}A-Za-z0-9·・]{2,40})/u;
  return instruction.match(pattern)?.[1] || null;
}

export async function resolveProposalPlaces(proposal: AgentProposal, destination: string, instruction = "") {
  const requested = [...new Map(proposal.operations.flatMap((operation) =>
    operation.type === "add_item" || operation.type === "replace_item"
      ? [[operation.placeId, /^(?:[NWR]:\d+|[NWR]\d+|osm:[^\s]+)$/i.test(operation.placeId) ? explicitPlaceName(instruction, operation) || operation.placeId : operation.placeId] as const]
      : [],
  )).entries()];
  if (requested.length > 4) throw new Error("too_many_place_queries");
  const results = await Promise.allSettled(requested.map(async ([modelId, query]) => {
    let result = await geocodePlace({ query, destinationHint: destination });
    const operation = proposal.operations.find((candidate) => (candidate.type === "add_item" || candidate.type === "replace_item") && candidate.placeId === modelId);
    const userNamedPlace = operation ? explicitPlaceName(instruction, operation) : null;
    if (!result.ok && userNamedPlace && userNamedPlace !== query) result = await geocodePlace({ query: userNamedPlace, destinationHint: destination });
    const alias = !result.ok ? localizedPlaceAlias(userNamedPlace || query, destination) : null;
    if (alias) result = await geocodePlace({ query: alias.query, destinationHint: destination });
    console.info("[agent-preview] place_lookup", { ok: result.ok, code: result.ok ? undefined : result.code, confidence: result.ok ? result.place.confidence : undefined, provider: result.ok ? result.place.provider : undefined });
    if (!result.ok || !result.place.placeId || (result.place.confidence ?? 0) < 0.7) throw new Error("unverified_place");
    const place: VerifiedAgentPlace = {
      id: result.place.placeId,
      title: alias?.displayName || result.place.placeName,
      location: {
        name: alias?.displayName || result.place.placeName, lat: result.place.lat, lng: result.place.lng,
        address: result.place.formattedAddress || undefined, description: "",
        openingHours: result.place.openingHours, phoneNumber: result.place.phoneNumber, website: result.place.website,
        placeId: result.place.placeId, resolvedFrom: result.place.provider === "overpass" ? "overpass" : "photon",
        checkedAt: new Date().toISOString(), confidence: result.place.confidence, verified: true,
      },
    };
    return { modelId, place };
  }));
  const places = new Map<string, VerifiedAgentPlace>();
  const resolvedIds = new Map<string, string>();
  for (const result of results) {
    if (result.status !== "fulfilled") throw new Error("unverified_place");
    places.set(result.value.place.id, result.value.place);
    resolvedIds.set(result.value.modelId, result.value.place.id);
  }
  const operations = proposal.operations.map((operation) =>
    operation.type === "add_item" || operation.type === "replace_item"
      ? { ...operation, placeId: resolvedIds.get(operation.placeId)! }
      : operation,
  );
  return { proposal: { ...proposal, operations } as AgentProposal, places };
}
