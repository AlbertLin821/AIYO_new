import type {
  ChatContext,
  ChatQuestionAnswer,
  ChatResponsePayload,
  ChatSource,
  QuestionCardPayload,
  StatusStepPayload,
  TravelPlanResponse,
  TravelPlanRevisionMeta,
  TripPlanRequest,
  TripPlanResult,
  TripProfile,
} from "@/types";

type ProgressStepInput = Omit<StatusStepPayload, "type">;

type GeneratedTripPlan = {
  plan: TripPlanResult;
  sources: Record<string, ChatSource>;
};

export type StructuredTripWorkflowInput = {
  message: string;
  context?: ChatContext;
  tripProfile?: TripProfile;
  questionAnswers?: ChatQuestionAnswer[];
  progressSessionId?: string;
  memoryContext?: string;
  forceStructuredRevision?: boolean;
};

export type StructuredTripWorkflowDependencies = {
  shouldHandle(input: StructuredTripWorkflowInput): boolean;
  publishProgress(progressSessionId: string | undefined, step: ProgressStepInput): void;
  mergeTripProfile(base?: TripProfile | null, context?: ChatContext): TripProfile;
  updateTripProfileFromText(profile: TripProfile, message: string): TripProfile;
  applyQuestionAnswers(profile: TripProfile, answers?: ChatQuestionAnswer[]): TripProfile;
  buildFallbackQuestionCard(profile: TripProfile, context?: ChatContext): QuestionCardPayload | null;
  buildDynamicQuestionCard(input: {
    message: string;
    profile: TripProfile;
    context?: ChatContext;
    fallbackCard: QuestionCardPayload;
    memoryContext?: string;
  }): Promise<QuestionCardPayload>;
  buildWaitingForInputStatusSteps(): StatusStepPayload[];
  buildPlanningStatusSteps(): StatusStepPayload[];
  profileToTripPlanRequest(profile: TripProfile, context?: ChatContext): TripPlanRequest;
  generateTripPlan(request: TripPlanRequest, memoryContext?: string, progressSessionId?: string): Promise<GeneratedTripPlan>;
  loadSupplementarySources(profile: TripProfile, progressSessionId?: string): Promise<Record<string, ChatSource>>;
  mergeSources(
    primary: Record<string, ChatSource>,
    supplementary: Record<string, ChatSource>,
  ): Record<string, ChatSource>;
  registerSources(sources: Record<string, ChatSource>): void;
  buildRevisionMeta(input: {
    previousDays?: ChatContext["itinerary"];
    nextDays: TripPlanResult["days"];
    profile: TripProfile;
  }): TravelPlanRevisionMeta | undefined;
  toTravelPlan(
    plan: TripPlanResult,
    profile: TripProfile,
    sources: Record<string, ChatSource>,
    revision?: TravelPlanRevisionMeta,
  ): TravelPlanResponse;
  now(): string;
};

export async function runStructuredTripWorkflow(
  input: StructuredTripWorkflowInput,
  deps: StructuredTripWorkflowDependencies,
): Promise<ChatResponsePayload | null> {
  if (!deps.shouldHandle(input)) {
    return null;
  }

  deps.publishProgress(input.progressSessionId, {
    phase: "understand",
    label: "理解旅遊需求",
    detail: "正在整理目的地、天數、旅伴與偏好條件。",
    status: "running",
  });

  const seeded = deps.mergeTripProfile(input.tripProfile, input.context);
  const withText = deps.updateTripProfileFromText(seeded, input.message);
  const profile = deps.applyQuestionAnswers(withText, input.questionAnswers);
  if (input.forceStructuredRevision && input.context?.itinerary?.length) {
    profile.plan_integration = "direct_merge";
  }

  const fallbackCard = deps.buildFallbackQuestionCard(profile, input.context);
  const card = fallbackCard
    ? await deps.buildDynamicQuestionCard({
        message: input.message,
        profile,
        context: input.context,
        fallbackCard,
        memoryContext: input.memoryContext,
      })
    : null;

  deps.publishProgress(input.progressSessionId, {
    phase: "understand",
    label: "理解旅遊需求",
    detail: "已整理目前已知的旅遊條件。",
    status: "completed",
  });

  if (card) {
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: card.title,
        timestamp: deps.now(),
        responseType: "question_card",
        statusSteps: deps.buildWaitingForInputStatusSteps(),
        questionCard: card,
        tripProfile: profile,
      },
      tripProfile: profile,
    };
  }

  deps.publishProgress(input.progressSessionId, {
    phase: "plan",
    label: "規劃查詢範圍",
    detail: "判斷是否需要查詢天氣、景點、活動與交通資料。",
    status: "running",
  });
  const request = deps.profileToTripPlanRequest(profile, input.context);
  deps.publishProgress(input.progressSessionId, {
    phase: "plan",
    label: "規劃查詢範圍",
    detail: "已決定查詢範圍，準備開始蒐集外部資料。",
    status: "completed",
  });

  const generated = await deps.generateTripPlan(request, input.memoryContext, input.progressSessionId);
  const supplementarySources = await deps.loadSupplementarySources(profile, input.progressSessionId);
  const sourceDictionary = deps.mergeSources(generated.sources, supplementarySources);
  if (Object.keys(sourceDictionary).length > 0) {
    deps.registerSources(sourceDictionary);
  }

  deps.publishProgress(input.progressSessionId, {
    phase: "compose",
    label: "生成完整行程",
    detail: "正在整理總覽、每日路線與提醒資訊。",
    status: "running",
    provider: "ollama",
  });
  const travelPlan = deps.toTravelPlan(
    generated.plan,
    profile,
    sourceDictionary,
    deps.buildRevisionMeta({
      previousDays: input.context?.itinerary,
      nextDays: generated.plan.days,
      profile,
    }),
  );
  deps.publishProgress(input.progressSessionId, {
    phase: "compose",
    label: "生成完整行程",
    detail: "最終行程已完成。",
    status: "completed",
    provider: "ollama",
  });

  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: travelPlan.title,
      timestamp: deps.now(),
      responseType: "travel_plan",
      statusSteps: deps.buildPlanningStatusSteps(),
      travelPlan,
      tripProfile: profile,
    },
    itinerarySuggestion: generated.plan,
    tripProfile: profile,
  };
}
