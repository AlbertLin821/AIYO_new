# AI 旅遊規劃網站 (AIYO) — Implementation Plan

## Goal

Build a high-fidelity, multi-page interactive frontend prototype for an AI Travel Planning website. The app features YouTube video analysis, map-based itinerary planning, AI voice/text assistance, collaborative editing, and profile management — all with a soft macaron-themed design aesthetic.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v3 |
| UI Components | shadcn/ui |
| Icons | lucide-react |
| Animation | Framer Motion (minimal) |
| State | React Context + useState |
| Map | Mock UI (placeholder for Google Maps) |
| Video | Mock embedded player (placeholder for YouTube API) |

---

## Design System

### Color Palette (Macaron Theme)
- **Primary**: `#7C9CBF` (soft blue) — navigation, primary actions
- **Secondary**: `#F4A7B9` (macaron pink) — accents, highlights
- **Tertiary**: `#B8D8BA` (sage green) — success, nature
- **Lavender**: `#C3B1E1` — AI features, voice
- **Peach**: `#FFDAB9` — warm accents
- **Cream**: `#FFF8F0` — background
- **Surface**: `#FFFFFF` — cards
- **Text**: `#2D3748` — primary text
- **Muted**: `#718096` — secondary text

### Visual Characteristics
- Large whitespace, rounded cards (`rounded-2xl`)
- Soft shadows (`shadow-sm`, `shadow-md`)
- Clean typography (Inter font)
- Subtle hover effects
- Minimal, purposeful animations

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home / YouTube page
│   ├── map/page.tsx            # Map planning page
│   ├── chat/page.tsx           # AI conversation page
│   ├── itinerary/page.tsx      # Itinerary management page
│   ├── profile/page.tsx        # Profile settings page
│   └── collaborate/page.tsx    # Collaborative editing page
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx       # Main layout wrapper
│   │   └── Sidebar.tsx         # Collapsible sidebar
│   ├── onboarding/
│   │   └── OnboardingModal.tsx # First-time user modal
│   ├── home/
│   │   ├── VideoSearchBar.tsx  # YouTube URL / keyword input
│   │   ├── VideoCard.tsx       # Video recommendation card
│   │   └── VideoSummaryDrawer.tsx # Right-side drawer
│   ├── map/
│   │   ├── MapView.tsx         # Mock map display
│   │   ├── MapPin.tsx          # Location pin component
│   │   ├── ItineraryPanel.tsx  # Right-side itinerary panel
│   │   ├── VoicePlanningButton.tsx # Voice AI button
│   │   └── FloatingAIChat.tsx  # Floating chat bubble
│   ├── chat/
│   │   ├── ChatWindow.tsx      # Full chat interface
│   │   ├── ChatMessage.tsx     # Message bubble
│   │   └── PreferenceSummary.tsx # AI-extracted preferences
│   ├── itinerary/
│   │   ├── ItineraryDayCard.tsx # Day block
│   │   └── ItineraryItem.tsx   # Individual item
│   ├── profile/
│   │   └── ProfileForm.tsx     # Profile settings form
│   ├── collaborate/
│   │   ├── CollaborationPanel.tsx # Main collaboration UI
│   │   ├── StickyComment.tsx   # Sticky note comment
│   │   ├── PresenceAvatars.tsx # Online user avatars
│   │   └── PermissionList.tsx  # Role management
│   └── ui/                    # shadcn/ui components
├── lib/
│   ├── types.ts               # TypeScript type definitions
│   ├── mock-data.ts           # All mock data
│   └── utils.ts               # Utility functions
└── contexts/
    └── AppContext.tsx          # Global state context
```

---

## Proposed Changes

### Step 1: Project Setup & Layout

#### [NEW] Next.js project initialization
- Initialize with `npx create-next-app@latest`
- Configure Tailwind CSS, shadcn/ui
- Set up Inter font from Google Fonts

#### [NEW] [AppLayout.tsx](file:///c:/Users/Administrator/Desktop/AIYO_test/src/components/layout/AppLayout.tsx)
- Main layout with sidebar + content area
- Consistent across all pages

#### [NEW] [Sidebar.tsx](file:///c:/Users/Administrator/Desktop/AIYO_test/src/components/layout/Sidebar.tsx)
- Collapsible sidebar with navigation links
- Icons for each page: Home, Map, Chat, Itinerary, Profile, Collaborate
- Expand/collapse toggle
- Active page indicator

---

### Step 2: Onboarding Modal

#### [NEW] [OnboardingModal.tsx](file:///c:/Users/Administrator/Desktop/AIYO_test/src/components/onboarding/OnboardingModal.tsx)
- Warm, friendly design
- Fields: travel days, destination
- "開始規劃" (Start Planning) CTA
- "我不知道" (Skip) button at bottom-right
- Backdrop blur, smooth enter/exit animation

---

### Step 3: Home Page (YouTube)

#### [NEW] [page.tsx](file:///c:/Users/Administrator/Desktop/AIYO_test/src/app/page.tsx) (Home)
- Search bar at top
- Recommended video grid below
- Side drawer for video details

#### [NEW] VideoSearchBar, VideoCard, VideoSummaryDrawer components
- VideoSearchBar: URL input + keyword search
- VideoCard: thumbnail, title, description, duration
- VideoSummaryDrawer: right-side panel with player, summary, timestamps, extracted locations, action buttons

---

### Step 4: Map Planning Page

#### [NEW] [map/page.tsx](file:///c:/Users/Administrator/Desktop/AIYO_test/src/app/map/page.tsx)
- Full-width map mock with pins
- Right-side itinerary panel (toggle)
- Bottom-center voice planning button
- Floating AI chat bubble

#### [NEW] MapView, MapPin, ItineraryPanel, VoicePlanningButton, FloatingAIChat
- MapView: mock map with gradient background, pin markers, route lines
- ItineraryPanel: day-by-day itinerary, collapsible
- VoicePlanningButton: large mic button, listening/processing states
- FloatingAIChat: small chat bubble → mini chat window

---

### Step 5: AI Conversation Page

#### [NEW] [chat/page.tsx](file:///c:/Users/Administrator/Desktop/AIYO_test/src/app/chat/page.tsx)
- Full conversation interface
- Voice-first, text-secondary
- AI/User message bubbles
- Input box + send button + voice button
- Preference summary sidebar

---

### Step 6: Itinerary Management Page

#### [NEW] [itinerary/page.tsx](file:///c:/Users/Administrator/Desktop/AIYO_test/src/app/itinerary/page.tsx)
- Multi-day timeline/card view
- Each day: time slots, locations, transport, notes
- Add/delete mock buttons
- Clean, editable-feeling UI

---

### Step 7: Profile Page

#### [NEW] [profile/page.tsx](file:///c:/Users/Administrator/Desktop/AIYO_test/src/app/profile/page.tsx)
- Settings-style form
- Fields: name, email, travel preferences, budget
- Preference tag chips
- Save button

---

### Step 8: Collaborative Editing Page

#### [NEW] [collaborate/page.tsx](file:///c:/Users/Administrator/Desktop/AIYO_test/src/app/collaborate/page.tsx)
- Invite code + share link
- Member list with roles (Owner/Editor/Viewer)
- Real-time sync status mock
- Cursor presence mock
- Sticky note comments

---

### Step 9: Polish & Animation

- Page transition animations (Framer Motion)
- Loading states, empty states
- Consistent hover effects
- Voice listening animation (wave form)
- AI processing animation

---

## TypeScript Types

```typescript
interface User {
  name: string;
  email: string;
  travelPreferences: string[];
  budget: number;
  destination: string;
  travelDays: number;
}

interface Video {
  id: string;
  title: string;
  thumbnail: string;
  url: string;
  duration: string;
  summary: string;
  timestamps: Timestamp[];
  extractedLocations: Location[];
}

interface Timestamp {
  time: string;
  label: string;
}

interface Location {
  name: string;
  lat: number;
  lng: number;
  description: string;
}

interface ItineraryDay {
  day: number;
  items: ItineraryItem[];
}

interface ItineraryItem {
  time: string;
  title: string;
  type: 'attraction' | 'restaurant' | 'transport' | 'hotel' | 'activity';
  transport?: string;
  notes?: string;
  location?: Location;
}

interface Collaboration {
  members: CollabMember[];
  inviteCode: string;
  shareLink: string;
  comments: StickyComment[];
  editingPresence: EditingPresence[];
}

interface CollabMember {
  id: string;
  name: string;
  avatar: string;
  role: 'owner' | 'editor' | 'viewer';
  online: boolean;
}

interface StickyComment {
  id: string;
  author: string;
  content: string;
  color: string;
  position: { x: number; y: number };
  createdAt: string;
}

interface EditingPresence {
  userId: string;
  userName: string;
  cursorPosition: { x: number; y: number };
  color: string;
  activeSection: string;
}
```

---

## Verification Plan

### Automated Tests
- `npm run build` — ensures no TypeScript/build errors
- `npm run dev` — verify all pages render

### Manual Verification
1. Navigate to each page via sidebar
2. Test sidebar collapse/expand
3. Test onboarding modal show/dismiss
4. Click video cards → verify drawer opens
5. Test map page itinerary panel toggle
6. Test voice button states
7. Test floating AI chat open/close
8. Verify consistent design across all pages

---

## Open Questions

> [!IMPORTANT]
> **Language**: The UI text will be primarily in Traditional Chinese (繁體中文) to match the user's language. Is this correct, or should it be in English?

> [!NOTE]
> **shadcn/ui version**: I'll use the latest stable shadcn/ui with Tailwind CSS v3 (not v4) for maximum compatibility. The `--defaults` flag will set up Next.js + base-nova preset.
