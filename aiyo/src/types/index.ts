export type TravelPace = "relaxed" | "moderate" | "intensive";

export type TripItemType =
  | "attraction"
  | "restaurant"
  | "transport"
  | "hotel"
  | "activity"
  | "shopping";

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface LocationReference {
  name: string;
  lat: number;
  lng: number;
  description: string;
  address?: string;
  placeId?: string;
  photoUrl?: string;
  thumbnail?: string;
  openingHours?: string;
  phoneNumber?: string;
  website?: string;
  googleMapsUrl?: string;
  rating?: number;
  userRatingsTotal?: number;
  /**
   * 地點如何被採用並對應座標：Google 地理編碼成功，或僅依 LLM／規則抽取並以內部對照補座標。
   */
  resolvedFrom?: "llm" | "heuristic" | "title-poi" | "google-geocode";
  rawQuery?: string;
  normalizedName?: string;
  /** Original transcript / query fragment before normalization. */
  raw?: string;
  /** Normalized comparison key (lowercase, trimmed). */
  normalized?: string;
  /** 0–1 aggregate confidence after extraction + geocode verification. */
  confidence?: number;
  /** Confidence dedicated to the Google geocode match gate. */
  geocodeConfidence?: number;
  geocodeMatchReason?: string;
  geocodeRejectedReason?: string;
  cleanedName?: string;
  rawMention?: string;
  /** True when Google geocode + context checks passed with sufficient score. */
  verified?: boolean;
  verifiedPlaceIds?: string[];
  mentionedFoods?: string[];
  extractionSource?: "deterministic" | "ai-polished" | "fallback";
  mentionContext?: string;
  sourceTranscriptLineIds?: string[];
}

export interface Timestamp {
  time: string;
  label: string;
}

export interface TravelPreferences {
  interests: string[];
  pace: TravelPace;
  transportPreference: string;
  budget?: number;
  mustVisit?: string[];
  avoid?: string[];
  notes?: string;
}

export interface TripPlanItem {
  id: string;
  dayNumber?: number;
  time: string;
  title: string;
  type: TripItemType;
  transport?: string;
  notes?: string;
  location?: LocationReference;
  source?: "manual" | "ai" | "video";
  estimatedCost?: number;
  sourceTitle?: string;
  sourceUrl?: string;
  sourceSnippet?: string;
  confidence?: "high" | "medium" | "low";
}

export interface TripPlanDay {
  dayNumber: number;
  theme?: string;
  summary?: string;
  items: TripPlanItem[];
}

export interface TripPlanRequest {
  destination: string;
  days: number;
  budget?: number;
  tripStartDate?: string;
  tripEndDate?: string;
  preferences: TravelPreferences;
  itineraryDraft?: TripPlanDay[];
}

export interface TripPlanResult {
  summary: string;
  days: TripPlanDay[];
  warnings?: string[];
}

export interface MapPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description: string;
  address?: string;
  placeId?: string;
  photoUrl?: string;
  thumbnail?: string;
  openingHours?: string;
  phoneNumber?: string;
  website?: string;
  googleMapsUrl?: string;
  rating?: number;
  userRatingsTotal?: number;
  color?: string;
  linkedTripItemId?: string;
  dayNumber?: number;
  source?: "itinerary" | "video" | "manual";
  /** Mirrored from LocationReference for UI (e.g. low-confidence badge). */
  confidence?: number;
  verified?: boolean;
}

export interface SuggestedAction {
  type: "add_itinerary_item" | "modify_itinerary" | "add_map_pin";
  dayNumber?: number;
  item?: Partial<TripPlanItem>;
}

export type AiProposedChange =
  | {
  type: "add_itinerary_item";
  day: number;
  time: string;
  title: string;
  locationName?: string;
  notes?: string;
  reason?: string;
  source: "ai-chat";
}
  | {
  type: "update_itinerary_item";
  day?: number;
  itemId?: string;
  targetTitle?: string;
  time?: string;
  title?: string;
  locationName?: string;
  notes?: string;
  transport?: string;
  reason?: string;
  source: "ai-chat";
}
  | {
  type: "remove_itinerary_item";
  day?: number;
  itemId?: string;
  targetTitle?: string;
  reason?: string;
  source: "ai-chat";
};

export type ChatResponseType = "text_message" | "question_card" | "status_step" | "travel_plan" | "error";

export type ChatQuestionType =
  | "single_choice"
  | "multi_choice"
  | "text"
  | "number"
  | "date_range"
  | "budget";

export type TripProfile = {
  destination: string | null;
  duration_days: number | null;
  duration_nights: number | null;
  departure_location: string | null;
  travel_dates: { start: string; end: string } | null;
  companions: string | null;
  traveler_count: number | null;
  budget: string | null;
  special_population: {
    has_elderly: boolean;
    has_children: boolean;
    mobility_issue: boolean;
  };
  preferences: string[];
  transportation: string | null;
  accommodation: string | null;
  visited_before: string[];
  avoid_places: string[];
  dietary_restrictions: string[];
  disliked_activities: string[];
  pace: string | null;
  plan_integration?: "direct_merge" | "self_merge" | null;
};

export type ChatQuestionOption = {
  label: string;
  value: string;
  recommended?: boolean;
};

export type ChatQuestion = {
  slot: keyof TripProfile | "special_needs";
  question: string;
  type: ChatQuestionType;
  options?: ChatQuestionOption[];
  placeholder?: string;
};

export type QuestionCardPayload = {
  response_type: "question_card";
  title: string;
  questions: ChatQuestion[];
  action?: {
    label: string;
    shortcut?: string;
  };
};

export type ChatQuestionAnswer = {
  slot: ChatQuestion["slot"];
  value: string | string[] | number | { start?: string; end?: string } | null;
};

export type StatusStepPhase =
  | "understand"
  | "plan"
  | "research"
  | "compose"
  | "waiting_user";

export type StatusStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "waiting_input"
  | "failed";

export type StatusStepProvider =
  | "google_places"
  | "open_meteo"
  | "tavily"
  | "youtube"
  | "searxng"
  | "ollama";

export type StatusStepPayload = {
  type: "status_step";
  phase: StatusStepPhase;
  label: string;
  detail?: string;
  status: StatusStepStatus;
  provider?: StatusStepProvider;
  query?: string;
  sourceIds?: string[];
  startedAt?: string;
  completedAt?: string;
};

export type ChatSource = {
  source_id: string;
  type: "web" | "youtube" | "weather" | "official" | "other";
  provider: string;
  title: string;
  url: string;
  domain: string;
  favicon?: string;
  snippet: string;
  preview_text: string;
  thumbnail?: string;
  published_at?: string | null;
  retrieved_at: string;
  reliability: "high" | "medium" | "low";
  language?: string;
};

export type CitationText = {
  text: string;
  citations?: string[];
};

export type TravelPlanRevisionMeta = {
  revision_id: string;
  revised_from: string;
  based_on_existing_itinerary: boolean;
  change_summary: string[];
  changed_days: string[];
  moved_items: Array<{
    title: string;
    from_day: string;
    to_day: string;
    from_time: string;
    to_time: string;
  }>;
  retimed_items: Array<{
    day: string;
    title: string;
    from_time: string;
    to_time: string;
  }>;
  added_items: Array<{
    day: string;
    title: string;
    time: string;
  }>;
  removed_items: Array<{
    day: string;
    title: string;
    time: string;
  }>;
};

export type TravelPlanResponse = {
  response_type: "travel_plan";
  title: string;
  revision?: TravelPlanRevisionMeta;
  sources?: Record<string, ChatSource>;
  summary_table: Array<{
    day: string;
    main_route: string;
    citations?: string[];
  }>;
  days: Array<{
    day: string;
    theme: string;
    citations?: string[];
    transportation: CitationText[];
    spots: Array<{
      name: string;
      feature: string;
      citations?: string[];
    }>;
    food_recommendations: Array<{
      name: string;
      description: string;
      citations?: string[];
    }>;
    tips: CitationText[];
  }>;
  weather_alerts: Array<{
    day: string;
    message: string;
    citations?: string[];
  }>;
  event_alerts: Array<{
    day?: string;
    message: string;
    citations?: string[];
  }>;
  assumptions: CitationText[];
};

export interface ChatContext {
  destination?: string;
  days?: number;
  budget?: number;
  itinerary?: TripPlanDay[];
  preferences?: TravelPreferences;
  /** ISO yyyy-mm-dd，用於天氣與活動檢索 */
  tripStartDate?: string;
  /** ISO yyyy-mm-dd，若省略則與 tripStartDate 同日 */
  tripEndDate?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "ai";
  content: string;
  timestamp: string;
  responseType?: ChatResponseType;
  questionCard?: QuestionCardPayload;
  statusSteps?: StatusStepPayload[];
  travelPlan?: TravelPlanResponse;
  tripProfile?: TripProfile;
  suggestedAction?: SuggestedAction;
  proposedChanges?: AiProposedChange[];
  sources?: Array<{
    title: string;
    url: string;
  }> | Record<string, ChatSource>;
}

export interface ChatRequestPayload {
  message: string;
  messages?: ChatMessage[];
  context?: ChatContext;
  structuredTravelPlanning?: boolean;
  tripProfile?: TripProfile;
  questionAnswers?: ChatQuestionAnswer[];
  progressSessionId?: string;
}

export interface ChatResponsePayload {
  reply: ChatMessage;
  itinerarySuggestion?: TripPlanResult;
  proposedChanges?: AiProposedChange[];
  tripProfile?: TripProfile;
}

export interface VideoSummarySegment {
  id: string;
  timestamp: string;
  text: string;
  title?: string;
  locationHints?: string[];
  startLabel?: string;
  endLabel?: string;
  startSeconds?: number;
  endSeconds?: number;
  summary?: string;
  highlights?: string[];
  foods?: string[];
  confidence?: number;
  timestampSource?: "youtube-transcript" | "description-fallback";
  timestampConfidence?: "high" | "low";
  extractionSource?: "deterministic" | "ai-polished" | "fallback";
  mentionContext?: string;
  sourceTranscriptLineIds?: string[];
  /** 選配：以 Google Places 文字搜尋比對段落標題；未定義表示未檢查。 */
  titlePlaceVerified?: boolean;
}

export interface VideoSummaryDebugMeta {
  transcriptSource: "youtube" | "fallback-description" | "fallback-synthetic" | "none";
  summarySource:
    | "ollama-transcript"
    | "heuristic-transcript-fallback"
    | "ollama-description-fallback"
    | "ollama-synthetic-fallback"
    | "unavailable";
  segmentSource:
    | "transcript-chunks"
    | "deterministic-mentions"
    | "deterministic-mentions-json-polished"
    | "description-fallback"
    | "synthetic-fallback"
    | "unavailable";
  captionLanguage?: string;
  captionKind?: "manual" | "asr";
  captionSource?: "watch-page-captions" | "timedtext" | "youtube-transcript-package";
  cacheStatus?: "memory-hit" | "persisted-hit" | "miss";
  pipelineVersion?: string;
  finalPlaceCount?: number;
  finalFoodCount?: number;
  failedChunkCount?: number;
  rejectedPlaceCandidateCount?: number;
  placeExtractionPipelineVersion?: string;
}

export interface VideoRecommendation {
  id: string;
  videoId?: string;
  title: string;
  thumbnail: string;
  url: string;
  duration: string;
  summary: string;
  description: string;
  source: string;
  channelTitle?: string;
  publishedAt?: string;
  relevanceReason?: string;
  timestamps: Timestamp[];
  extractedLocations: LocationReference[];
  extractedFoods?: string[];
  summarySegments?: VideoSummarySegment[];
  /** Batch search: whether results came from YouTube Data API or mock fallback */
  listProvenance?: "youtube-data-api" | "mock-fallback" | "default-taiwan-cities";
}

export interface VideoSummaryResult {
  source: "youtube-summary-service";
  transcriptSource: VideoSummaryDebugMeta["transcriptSource"];
  summarySource: VideoSummaryDebugMeta["summarySource"];
  segmentSource: VideoSummaryDebugMeta["segmentSource"];
  title: string;
  summary: string;
  segments: VideoSummarySegment[];
  extractedLocations: string[];
  extractedFoods?: string[];
  mapsProvenance?: "google-geocoding" | "catalog-fallback" | "mixed";
  geocodeWarnings?: string[];
  fallbackReason?: string;
  /** 無逐字稿等情況，不提供精準摘要 */
  summaryUnavailable?: boolean;
  unavailableReason?: string;
  video: VideoRecommendation;
  debug?: VideoSummaryDebugMeta;
}

export interface CollaborativeComment {
  id: string;
  /** 留言作者使用者 id，供前端判斷是否顯示刪除 */
  authorId?: string;
  author: string;
  authorAvatar?: string;
  content: string;
  color: string;
  position: { x: number; y: number };
  createdAt: string;
  targetDay?: number;
}

export interface CollabMember {
  id: string;
  name: string;
  avatar: string;
  role: "owner" | "editor" | "viewer";
  online: boolean;
}

export interface EditingPresence {
  userId: string;
  userName: string;
  cursorPosition: { x: number; y: number };
  color: string;
  activeSection: string;
}

export interface Collaboration {
  members: CollabMember[];
  roomId?: string;
  tripId?: string;
  inviteCode: string;
  shareLink: string;
  comments: CollaborativeComment[];
  editingPresence: EditingPresence[];
}

export interface User {
  name: string;
  email: string;
  travelPreferences: string[];
  budget: number;
  destination: string;
  travelDays: number;
  preferredTransport: string;
  /** 空白表示尚未在個人檔選擇節奏 */
  travelPace: TravelPace | "";
  interests: string[];
}

export type ExtractedLocation = LocationReference;
export type ItineraryDay = TripPlanDay;
export type ItineraryItem = TripPlanItem;
export type StickyCommentData = CollaborativeComment;
export type Video = VideoRecommendation;

export type VideoAnalysisResponse = VideoSummaryResult;

export interface TripPlanResponse {
  tripPlan: TripPlanResult;
  extractedPreferences: {
    destination: string;
    budget: number;
    days: number;
    interests: string[];
    pace: TravelPace;
    transportPreference: string;
  };
}

export interface GeocodeApiResult {
  query: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  placeId?: string;
  photoUrl?: string;
  thumbnail?: string;
  openingHours?: string;
  phoneNumber?: string;
  website?: string;
  googleMapsUrl?: string;
  rating?: number;
  userRatingsTotal?: number;
  types?: string[];
  countryCode?: string;
}

export interface GeocodeResponse {
  results: GeocodeApiResult[];
}

export interface PersistedTripPayload {
  tripId: string;
  title: string;
  destination: string;
  days: number;
  budget?: number;
  /** 封面圖（資料網址或 https URL），由前端壓縮後寫入 */
  coverImageUrl?: string | null;
  itinerary: TripPlanDay[];
  pins: MapPin[];
  updatedAt: string;
}

export interface CollaborationPresenceState {
  roomId: string;
  inviteCode: string;
  shareLink: string;
  comments: CollaborativeComment[];
  presence: EditingPresence[];
  members: CollabMember[];
}

export interface BootstrapPayload {
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
  };
  profile: User;
  /** 若為 false，登入後應於首頁顯示歡迎引導（尚未完成或新帳號） */
  onboardingCompleted: boolean;
  trip: PersistedTripPayload | null;
  chatMessages: ChatMessage[];
  collaboration: CollaborationPresenceState | null;
}

export interface MemoryRecord {
  id: string;
  memory: string;
  user_id?: string;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}
