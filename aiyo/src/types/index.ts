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
  /** True when Google geocode + context checks passed with sufficient score. */
  verified?: boolean;
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

export interface ChatContext {
  destination?: string;
  days?: number;
  budget?: number;
  itinerary?: TripPlanDay[];
  preferences?: TravelPreferences;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "ai";
  content: string;
  timestamp: string;
  suggestedAction?: SuggestedAction;
}

export interface ChatRequestPayload {
  message: string;
  messages?: ChatMessage[];
  context?: ChatContext;
}

export interface ChatResponsePayload {
  reply: ChatMessage;
  itinerarySuggestion?: TripPlanResult;
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
}

export interface VideoSummaryDebugMeta {
  transcriptSource: "youtube" | "fallback-description" | "fallback-synthetic" | "none";
  summarySource:
    | "ollama-transcript"
    | "heuristic-transcript-fallback"
    | "ollama-description-fallback"
    | "ollama-synthetic-fallback"
    | "unavailable";
  segmentSource: "transcript-chunks" | "description-fallback" | "synthetic-fallback" | "unavailable";
  captionLanguage?: string;
  captionKind?: "manual" | "asr";
  captionSource?: "watch-page-captions" | "timedtext" | "youtube-transcript-package";
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
  summarySegments?: VideoSummarySegment[];
  /** Batch search: whether results came from YouTube Data API or mock fallback */
  listProvenance?: "youtube-data-api" | "mock-fallback";
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
  travelPace: TravelPace;
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
