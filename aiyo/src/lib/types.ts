// === User ===
export interface User {
  name: string;
  email: string;
  travelPreferences: string[];
  budget: number;
  destination: string;
  travelDays: number;
  preferredTransport: string;
  travelPace: 'relaxed' | 'moderate' | 'intensive';
  interests: string[];
}

// === Video ===
export interface Video {
  id: string;
  title: string;
  thumbnail: string;
  url: string;
  duration: string;
  summary: string;
  description: string;
  source: string;
  timestamps: Timestamp[];
  extractedLocations: ExtractedLocation[];
}

export interface Timestamp {
  time: string;
  label: string;
}

export interface ExtractedLocation {
  name: string;
  lat: number;
  lng: number;
  description: string;
  address?: string;
}

// === Itinerary ===
export interface ItineraryDay {
  day: number;
  theme?: string;
  items: ItineraryItem[];
}

export interface ItineraryItem {
  id: string;
  time: string;
  title: string;
  type: 'attraction' | 'restaurant' | 'transport' | 'hotel' | 'activity' | 'shopping';
  transport?: string;
  notes?: string;
  location?: ExtractedLocation;
}

// === Collaboration ===
export interface Collaboration {
  members: CollabMember[];
  inviteCode: string;
  shareLink: string;
  comments: StickyCommentData[];
  editingPresence: EditingPresence[];
}

export interface CollabMember {
  id: string;
  name: string;
  avatar: string;
  role: 'owner' | 'editor' | 'viewer';
  online: boolean;
}

export interface StickyCommentData {
  id: string;
  author: string;
  authorAvatar: string;
  content: string;
  color: string;
  position: { x: number; y: number };
  createdAt: string;
  targetDay?: number;
}

export interface EditingPresence {
  userId: string;
  userName: string;
  cursorPosition: { x: number; y: number };
  color: string;
  activeSection: string;
}

// === Chat ===
export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
  suggestedAction?: SuggestedAction;
}

export interface SuggestedAction {
  type: 'add_itinerary_item' | 'modify_itinerary' | 'add_map_pin';
  day?: number;
  item?: Partial<ItineraryItem>;
}

// === API Responses ===
export interface VideoAnalysisResponse {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  summary: string;
  timestamps: Timestamp[];
  extractedLocations: ExtractedLocation[];
}

export interface TripPlanResponse {
  tripPlan: {
    summary: string;
    days: ItineraryDay[];
  };
  extractedPreferences: {
    destination: string;
    budget: number;
    days: number;
    interests: string[];
    pace: string;
  };
}

export interface GeocodeResponse {
  results: (ExtractedLocation & { address: string })[];
}
