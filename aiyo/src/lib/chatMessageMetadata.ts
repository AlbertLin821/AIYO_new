import type { ChatMessage } from "@/types";

/** Fields persisted in `ChatMessage.metadata` (Prisma JSON column). */
export type PersistedChatMessageMetadata = {
  responseType?: ChatMessage["responseType"];
  questionCard?: ChatMessage["questionCard"];
  preferenceConfirmation?: ChatMessage["preferenceConfirmation"];
  statusSteps?: ChatMessage["statusSteps"];
  travelPlan?: ChatMessage["travelPlan"];
  tripProfile?: ChatMessage["tripProfile"];
  suggestedAction?: ChatMessage["suggestedAction"];
  proposedChanges?: ChatMessage["proposedChanges"];
  assistantActions?: ChatMessage["assistantActions"];
  sources?: ChatMessage["sources"];
  sourceReferences?: ChatMessage["sourceReferences"];
  toolCalls?: ChatMessage["toolCalls"];
  itineraryPatch?: ChatMessage["itineraryPatch"];
};

export function extractChatMessageMetadata(message: ChatMessage): PersistedChatMessageMetadata | null {
  const metadata: PersistedChatMessageMetadata = {};

  if (message.responseType) {
    metadata.responseType = message.responseType;
  }
  if (message.questionCard) {
    metadata.questionCard = message.questionCard;
  }
  if (message.preferenceConfirmation) {
    metadata.preferenceConfirmation = message.preferenceConfirmation;
  }
  if (message.statusSteps?.length) {
    metadata.statusSteps = message.statusSteps;
  }
  if (message.travelPlan) {
    metadata.travelPlan = message.travelPlan;
  }
  if (message.tripProfile) {
    metadata.tripProfile = message.tripProfile;
  }
  if (message.suggestedAction) {
    metadata.suggestedAction = message.suggestedAction;
  }
  if (message.proposedChanges?.length) {
    metadata.proposedChanges = message.proposedChanges;
  }
  if (message.assistantActions?.length) {
    metadata.assistantActions = message.assistantActions;
  }
  if (message.sources) {
    metadata.sources = message.sources;
  }
  if (message.sourceReferences?.length) {
    metadata.sourceReferences = message.sourceReferences;
  }
  if (message.toolCalls?.length) {
    metadata.toolCalls = message.toolCalls;
  }
  if (message.itineraryPatch) {
    metadata.itineraryPatch = message.itineraryPatch;
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
}

export function applyChatMessageMetadata(
  message: ChatMessage,
  raw: unknown,
): ChatMessage {
  if (!raw || typeof raw !== "object") {
    return message;
  }
  const stored = raw as PersistedChatMessageMetadata;
  return {
    ...message,
    responseType: stored.responseType ?? message.responseType,
    questionCard: stored.questionCard ?? message.questionCard,
    preferenceConfirmation: stored.preferenceConfirmation ?? message.preferenceConfirmation,
    statusSteps: stored.statusSteps?.length ? stored.statusSteps : message.statusSteps,
    travelPlan: stored.travelPlan ?? message.travelPlan,
    tripProfile: stored.tripProfile ?? message.tripProfile,
    suggestedAction: stored.suggestedAction ?? message.suggestedAction,
    proposedChanges: stored.proposedChanges ?? message.proposedChanges,
    assistantActions: stored.assistantActions ?? message.assistantActions,
    sources: stored.sources ?? message.sources,
    sourceReferences: stored.sourceReferences ?? message.sourceReferences,
    toolCalls: stored.toolCalls ?? message.toolCalls,
    itineraryPatch: stored.itineraryPatch ?? message.itineraryPatch,
    metadata: stored as Record<string, unknown>,
  };
}
