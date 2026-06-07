--
-- PostgreSQL database dump
--

\restrict cWHJer5957LgSQ8abSNAMPiuWJhh8EQ150ObHJG7w5i6cS0LpEVFr9OzxgA0i5P

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg12+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO aiyo;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.accounts (
    id text NOT NULL,
    "userId" text NOT NULL,
    type text NOT NULL,
    provider text NOT NULL,
    "providerAccountId" text NOT NULL,
    refresh_token text,
    access_token text,
    expires_at integer,
    token_type text,
    scope text,
    id_token text,
    session_state text
);


ALTER TABLE public.accounts OWNER TO aiyo;

--
-- Name: applied_video_summaries; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.applied_video_summaries (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tripId" text,
    "videoId" text NOT NULL,
    "summaryId" text,
    "videoUrl" text,
    title text,
    "appliedPlaces" jsonb,
    "appliedSegments" jsonb,
    "createdTripItems" jsonb,
    "summarySnapshot" jsonb,
    "appliedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.applied_video_summaries OWNER TO aiyo;

--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.chat_messages (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tripId" text,
    role text NOT NULL,
    content text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    metadata jsonb
);


ALTER TABLE public.chat_messages OWNER TO aiyo;

--
-- Name: collaboration_presence; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.collaboration_presence (
    id text NOT NULL,
    "roomId" text NOT NULL,
    "userId" text NOT NULL,
    "activeSection" text,
    "selectedEntityId" text,
    online boolean DEFAULT true NOT NULL,
    "lastSeenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "cursorX" double precision,
    "cursorY" double precision
);


ALTER TABLE public.collaboration_presence OWNER TO aiyo;

--
-- Name: collaboration_rooms; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.collaboration_rooms (
    id text NOT NULL,
    "tripId" text NOT NULL,
    "inviteCode" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.collaboration_rooms OWNER TO aiyo;

--
-- Name: comments; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.comments (
    id text NOT NULL,
    "roomId" text NOT NULL,
    "authorId" text NOT NULL,
    content text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.comments OWNER TO aiyo;

--
-- Name: itinerary_folders; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.itinerary_folders (
    id text NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "userId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.itinerary_folders OWNER TO aiyo;

--
-- Name: map_pins; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.map_pins (
    id text NOT NULL,
    "tripId" text NOT NULL,
    label text NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    description text,
    address text,
    "linkedTripItemId" text,
    "dayNumber" integer,
    "placeId" text,
    "photoUrl" text,
    thumbnail text,
    "openingHours" text,
    "phoneNumber" text,
    website text,
    "googleMapsUrl" text,
    rating double precision,
    "userRatingsTotal" integer,
    color text,
    source text,
    confidence double precision,
    verified boolean
);


ALTER TABLE public.map_pins OWNER TO aiyo;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.profiles (
    id text NOT NULL,
    "userId" text NOT NULL,
    budget integer,
    destination text,
    preferences jsonb
);


ALTER TABLE public.profiles OWNER TO aiyo;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    "sessionToken" text NOT NULL,
    "userId" text NOT NULL,
    expires timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.sessions OWNER TO aiyo;

--
-- Name: trip_collaborators; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.trip_collaborators (
    id text NOT NULL,
    "tripId" text NOT NULL,
    "userId" text NOT NULL,
    role text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.trip_collaborators OWNER TO aiyo;

--
-- Name: trip_days; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.trip_days (
    id text NOT NULL,
    "tripId" text NOT NULL,
    "dayNumber" integer NOT NULL,
    theme text,
    summary text,
    "sortOrder" integer NOT NULL
);


ALTER TABLE public.trip_days OWNER TO aiyo;

--
-- Name: trip_items; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.trip_items (
    id text NOT NULL,
    "tripId" text NOT NULL,
    day integer NOT NULL,
    title text NOT NULL,
    description text,
    "timeSlot" text,
    location text,
    latitude double precision,
    longitude double precision,
    "order" integer NOT NULL,
    "itemType" text,
    source text,
    "locationDesc" text,
    "locationAddress" text,
    "placeId" text,
    "photoUrl" text,
    thumbnail text,
    "openingHours" text,
    "phoneNumber" text,
    website text,
    "googleMapsUrl" text,
    rating double precision,
    "userRatingsTotal" integer,
    confidence double precision,
    verified boolean,
    "transportMode" text,
    "transportDurationMinutes" integer,
    "transportDistanceMeters" integer,
    "transportDataSource" text
);


ALTER TABLE public.trip_items OWNER TO aiyo;

--
-- Name: trip_publications; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.trip_publications (
    id text NOT NULL,
    "tripId" text NOT NULL,
    "publisherId" text NOT NULL,
    title text NOT NULL,
    "coverImageUrl" text,
    days integer NOT NULL,
    destination text,
    "searchText" text DEFAULT ''::text NOT NULL,
    "snapshotJson" jsonb NOT NULL,
    "publisherImage" text,
    "publishedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "revokedAt" timestamp(3) without time zone
);


ALTER TABLE public.trip_publications OWNER TO aiyo;

--
-- Name: trips; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.trips (
    id text NOT NULL,
    "userId" text NOT NULL,
    title text NOT NULL,
    destination text,
    days integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "folderId" text,
    "coverImageUrl" text
);


ALTER TABLE public.trips OWNER TO aiyo;

--
-- Name: users; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    name text,
    image text,
    "emailVerified" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "passwordHash" text
);


ALTER TABLE public.users OWNER TO aiyo;

--
-- Name: verification_tokens; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.verification_tokens (
    identifier text NOT NULL,
    token text NOT NULL,
    expires timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.verification_tokens OWNER TO aiyo;

--
-- Name: video_interactions; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.video_interactions (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tripId" text,
    "videoId" text NOT NULL,
    source text,
    "videoUrl" text,
    title text,
    "interactionType" text NOT NULL,
    "analysisId" text,
    "summaryId" text,
    "watchDurationSeconds" integer,
    progress double precision,
    "extractedPlaces" jsonb,
    "extractedTimestamps" jsonb,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.video_interactions OWNER TO aiyo;

--
-- Name: video_summary_caches; Type: TABLE; Schema: public; Owner: aiyo
--

CREATE TABLE public.video_summary_caches (
    id text NOT NULL,
    "videoId" text NOT NULL,
    result jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.video_summary_caches OWNER TO aiyo;

--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
e73358b1-f3b3-49f0-bf7c-0dd8ad4dc852	b83129ca466677f6fdb168e918868b58934a6a38826843a543c897aefa1be1c8	2026-06-04 17:42:05.804827+00	20260416_000001_phase3_init	\N	\N	2026-06-04 17:42:05.686633+00	1
62a624de-c6e6-45ea-82cc-f89950f7f5ef	f39a8d12f82396afaeca2742a0366b5dbc01ca07c7093d93081433e74edd3ee8	2026-06-04 17:42:05.812205+00	20260416_000002_add_password_hash	\N	\N	2026-06-04 17:42:05.806408+00	1
afcc6e4e-6fe1-4f74-a809-900c48f3f33a	8b44d4bca24718143027df1f052e36d1a3256a62cda14b090d885b6ac1a185be	2026-06-04 17:42:05.831836+00	20260417_000003_add_trip_days	\N	\N	2026-06-04 17:42:05.813776+00	1
6c2f6be6-f770-4139-8622-6bf205ff4488	f53875faea4a5a9381e68224e87e4e9f154f37fe1e30a135749b69f077baf5eb	2026-06-04 17:42:05.864819+00	20260425_000004_folders_collaborators	\N	\N	2026-06-04 17:42:05.833356+00	1
913b05b8-6ec7-46b5-a7ef-950b5505d360	dc9234768e96158aeb200d676445727b20d15964449f17095ee8ff282c28e294	2026-06-04 17:42:05.871673+00	20260502110007_add_presence_cursor	\N	\N	2026-06-04 17:42:05.866235+00	1
e46a8e0e-c6d6-4f62-941a-bcae50e44f46	770aa659647e90c268490809afd3850bf1dead0409443363bf9ab28dca5d0b4a	2026-06-04 17:42:05.878364+00	20260509120000_add_trip_cover_image_url	\N	\N	2026-06-04 17:42:05.873267+00	1
95240143-fa59-411c-9233-52d7c5c40b21	5cdc17ecad30d5c14ce126f14b849bd19a8de9563b284c7615711665783d8c25	2026-06-04 17:42:05.893872+00	20260510002000_add_video_summary_cache	\N	\N	2026-06-04 17:42:05.879762+00	1
3d1f1049-c6d6-4699-99de-2e742208dcbd	99efad2677cbc6805df3d846b15a983beddfd0b7b59e2729c7964fe79efabcb6	2026-06-04 17:42:05.90176+00	20260510032700_persist_trip_item_and_pin_details	\N	\N	2026-06-04 17:42:05.895826+00	1
7f916edb-8326-4980-b1cf-e9f87d565f97	0d6aeea7b3644a42d46421803062df3882e63b3553e892ea1efe180da5f70d90	2026-06-04 17:42:05.908772+00	20260513150000_add_trip_item_transport_mode	\N	\N	2026-06-04 17:42:05.903585+00	1
d547c28c-338f-433a-b27e-3e49086d4eea	20a06a18b43debadd31a36cd71e300270b1f247065ae00bc6eaaac412240c451	2026-06-04 17:42:05.915344+00	20260520143000_add_trip_item_transport_route_data	\N	\N	2026-06-04 17:42:05.910577+00	1
a5316a06-4a27-46a3-8964-925ead10e455	55a8fbc3ba8bd0576d1f2eea320795ee0b78f3f083b572134fe903eea6acc9d1	2026-06-04 17:42:05.921805+00	20260526120000_add_chat_message_metadata	\N	\N	2026-06-04 17:42:05.917095+00	1
1bc3ff24-2ecc-47cc-a205-dbea6f525f8a	e3b0ff64dda798b55b26522c870120d49bb5f0226184fdca913625e8db4828e0	2026-06-04 17:42:05.942542+00	20260526180000_add_trip_publications	\N	\N	2026-06-04 17:42:05.923603+00	1
c2d0394d-1558-4c52-90bb-eb9f998a9f90	c284bd1d8a037f221cc0ee0c740b89d33f5f1e24666a014d6ccaaf1d7ab97282	2026-06-04 17:42:05.980257+00	20260530021000_add_video_personalization_records	\N	\N	2026-06-04 17:42:05.944811+00	1
\.


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.accounts (id, "userId", type, provider, "providerAccountId", refresh_token, access_token, expires_at, token_type, scope, id_token, session_state) FROM stdin;
\.


--
-- Data for Name: applied_video_summaries; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.applied_video_summaries (id, "userId", "tripId", "videoId", "summaryId", "videoUrl", title, "appliedPlaces", "appliedSegments", "createdTripItems", "summarySnapshot", "appliedAt") FROM stdin;
\.


--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.chat_messages (id, "userId", "tripId", role, content, "createdAt", metadata) FROM stdin;
cmpzx2mjy00rfpn84y8unqz9n	cmpzvydlg0000o17tqskqnik4	cmpzx2g0c00qrpn84bq927bsc	user	我要去嘉義七天	2026-06-04 19:57:14.542	\N
cmpzx2mkm00rhpn849pl9rb4k	cmpzvydlg0000o17tqskqnik4	cmpzx2g0c00qrpn84bq927bsc	assistant	可以，嘉義 7 天我先建立基本框架。想走小資、舒適還是高預算？交通偏好大眾運輸、計程車或自駕？另外比較想偏自然景觀、美食購物，還是娛樂體驗？	2026-06-04 19:57:14.567	{"tripProfile": {"pace": null, "budget": null, "companions": null, "destination": "嘉義", "preferences": [], "avoid_places": [], "travel_dates": null, "accommodation": null, "duration_days": 7, "transportation": null, "traveler_count": null, "visited_before": [], "duration_nights": 6, "plan_integration": "direct_merge", "departure_location": null, "special_population": {"has_elderly": false, "has_children": false, "mobility_issue": false}, "disliked_activities": [], "dietary_restrictions": []}, "questionCard": {"title": "再確認一下嘉義行程偏好", "action": {"label": "送出並繼續", "shortcut": "Enter"}, "questions": [{"slot": "travel_dates", "type": "date_range", "endLabel": "回程日期", "question": "嘉義預計哪幾天出發？", "helperText": "如果日期還沒完全確定，也可以先選一個大概區間。", "startLabel": "出發日期"}, {"slot": "traveler_count", "type": "single_choice", "options": [{"label": "1 人", "value": "1"}, {"label": "2 人", "value": "2", "recommended": true}, {"label": "3–4 人", "value": "4"}, {"label": "5 人以上", "value": "5"}], "question": "這次大概幾個人同行？", "helperText": "我會依人數調整交通、用餐和節奏建議。"}], "description": "選好後我會依你的偏好繼續規劃。", "response_type": "question_card"}, "responseType": "question_card"}
cmpzx2sj100s4pn84m9rmjj49	cmpzvydlg0000o17tqskqnik4	cmpzx2g0c00qrpn84bq927bsc	user	已收到你的需求：\n- 嘉義預計哪幾天出發？：2026-06-05 ~ 2026-06-12\n- 這次大概幾個人同行？：3–4 人	2026-06-04 19:57:22.286	\N
cmpzx2wf200scpn84csuq388x	cmpzvydlg0000o17tqskqnik4	cmpzx2g0c00qrpn84bq927bsc	assistant	嘉義8天7夜行程規劃	2026-06-04 19:57:27.325	{"travelPlan": {"days": [{"day": "Day 1", "tips": [{"text": "安排停留 嘉義七彩冰果室。"}, {"text": "安排在 果然茶香觀光園區｜聚拾光廚房 用餐。"}, {"text": "安排停留 粉牛樂園。"}], "spots": [{"name": "嘉義七彩冰果室", "feature": "安排停留 嘉義七彩冰果室。"}, {"name": "粉牛樂園", "feature": "安排停留 粉牛樂園。"}, {"name": "森林之歌", "feature": "安排停留 森林之歌。"}], "theme": "嘉義七彩冰果室", "transportation": [{"text": "嘉義七彩冰果室 → 果然茶香觀光園區｜聚拾光廚房：自駕"}, {"text": "果然茶香觀光園區｜聚拾光廚房 → 粉牛樂園：自駕"}, {"text": "粉牛樂園 → 森林之歌：自駕"}, {"text": "森林之歌 → 穎覓食光日式料理（嘉義店）：自駕"}], "food_recommendations": [{"name": "果然茶香觀光園區｜聚拾光廚房", "description": "安排在 果然茶香觀光園區｜聚拾光廚房 用餐。"}, {"name": "穎覓食光日式料理（嘉義店）", "description": "安排在 穎覓食光日式料理（嘉義店） 用餐。"}]}, {"day": "Day 2", "tips": [{"text": "安排停留 森林之歌。"}, {"text": "安排在 舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場 用餐。"}, {"text": "安排停留 山樣子美食基地。"}], "spots": [{"name": "森林之歌", "feature": "安排停留 森林之歌。"}, {"name": "山樣子美食基地", "feature": "安排停留 山樣子美食基地。"}, {"name": "阿肥肥二通食堂", "feature": "安排停留 阿肥肥二通食堂。"}], "theme": "森林之歌", "transportation": [{"text": "森林之歌 → 舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場：自駕"}, {"text": "舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場 → 山樣子美食基地：自駕"}, {"text": "山樣子美食基地 → 阿肥肥二通食堂：自駕"}, {"text": "阿肥肥二通食堂 → 咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店：自駕"}], "food_recommendations": [{"name": "舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場", "description": "安排在 舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場 用餐。"}, {"name": "咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店", "description": "安排在 咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店 用餐。"}]}, {"day": "Day 3", "tips": [{"text": "安排停留 阿肥肥二通食堂。"}, {"text": "安排在 鮮御快車 嘉義平價美食｜在地美食｜人氣雞湯｜雞湯推薦 用餐。"}, {"text": "安排停留 果然茶香觀光園區｜聚拾光廚房。"}], "spots": [{"name": "阿肥肥二通食堂", "feature": "安排停留 阿肥肥二通食堂。"}, {"name": "果然茶香觀光園區｜聚拾光廚房", "feature": "安排停留 果然茶香觀光園區｜聚拾光廚房。"}, {"name": "舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場", "feature": "安排停留 舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場。"}], "theme": "阿肥肥二通食堂", "transportation": [{"text": "阿肥肥二通食堂 → 鮮御快車 嘉義平價美食｜在地美食｜人氣雞湯｜雞湯推薦：自駕"}, {"text": "鮮御快車 嘉義平價美食｜在地美食｜人氣雞湯｜雞湯推薦 → 果然茶香觀光園區｜聚拾光廚房：自駕"}, {"text": "果然茶香觀光園區｜聚拾光廚房 → 舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場：自駕"}, {"text": "舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場 → 饗吃堡飽優：自駕"}], "food_recommendations": [{"name": "鮮御快車 嘉義平價美食｜在地美食｜人氣雞湯｜雞湯推薦", "description": "安排在 鮮御快車 嘉義平價美食｜在地美食｜人氣雞湯｜雞湯推薦 用餐。"}, {"name": "饗吃堡飽優", "description": "安排在 饗吃堡飽優 用餐。"}]}, {"day": "Day 4", "tips": [{"text": "安排停留 舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場。"}, {"text": "安排在 穎覓食光日式料理（嘉義店） 用餐。"}, {"text": "安排停留 鮮御快車 嘉義平價美食｜在地美食｜人氣雞湯｜雞湯推薦。"}], "spots": [{"name": "舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場", "feature": "安排停留 舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場。"}, {"name": "鮮御快車 嘉義平價美食｜在地美食｜人氣雞湯｜雞湯推薦", "feature": "安排停留 鮮御快車 嘉義平價美食｜在地美食｜人氣雞湯｜雞湯推薦。"}, {"name": "穎覓食光日式料理（嘉義店）", "feature": "安排停留 穎覓食光日式料理（嘉義店）。"}], "theme": "舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場", "transportation": [{"text": "舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場 → 穎覓食光日式料理（嘉義店）：自駕"}, {"text": "穎覓食光日式料理（嘉義店） → 鮮御快車 嘉義平價美食｜在地美食｜人氣雞湯｜雞湯推薦：自駕"}, {"text": "鮮御快車 嘉義平價美食｜在地美食｜人氣雞湯｜雞湯推薦 → 穎覓食光日式料理（嘉義店）：自駕"}, {"text": "穎覓食光日式料理（嘉義店） → 林聰明沙鍋魚頭：自駕"}], "food_recommendations": [{"name": "穎覓食光日式料理（嘉義店）", "description": "安排在 穎覓食光日式料理（嘉義店） 用餐。"}, {"name": "林聰明沙鍋魚頭", "description": "安排在 林聰明沙鍋魚頭 用餐。"}]}, {"day": "Day 5", "tips": [{"text": "安排停留 穎覓食光日式料理（嘉義店）。"}, {"text": "安排在 咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店 用餐。"}, {"text": "安排停留 咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店。"}], "spots": [{"name": "穎覓食光日式料理（嘉義店）", "feature": "安排停留 穎覓食光日式料理（嘉義店）。"}, {"name": "咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店", "feature": "安排停留 咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店。"}, {"name": "饗吃堡飽優", "feature": "安排停留 饗吃堡飽優。"}], "theme": "穎覓食光日式料理（嘉義店）", "transportation": [{"text": "穎覓食光日式料理（嘉義店） → 咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店：自駕"}, {"text": "咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店 → 咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店：自駕"}, {"text": "咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店 → 饗吃堡飽優：自駕"}, {"text": "饗吃堡飽優 → 巷子裡的小餐館（建議電話先預訂）：自駕"}], "food_recommendations": [{"name": "咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店", "description": "安排在 咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店 用餐。"}, {"name": "巷子裡的小餐館（建議電話先預訂）", "description": "安排在 巷子裡的小餐館（建議電話先預訂） 用餐。"}]}, {"day": "Day 6", "tips": [{"text": "安排停留 饗吃堡飽優。"}, {"text": "安排在 饗吃堡飽優 用餐。"}, {"text": "安排停留 林聰明沙鍋魚頭。"}], "spots": [{"name": "饗吃堡飽優", "feature": "安排停留 饗吃堡飽優。"}, {"name": "林聰明沙鍋魚頭", "feature": "安排停留 林聰明沙鍋魚頭。"}, {"name": "巷子裡的小餐館（建議電話先預訂）", "feature": "安排停留 巷子裡的小餐館（建議電話先預訂）。"}], "theme": "饗吃堡飽優", "transportation": [{"text": "饗吃堡飽優 → 饗吃堡飽優：自駕"}, {"text": "饗吃堡飽優 → 林聰明沙鍋魚頭：自駕"}, {"text": "林聰明沙鍋魚頭 → 巷子裡的小餐館（建議電話先預訂）：自駕"}, {"text": "巷子裡的小餐館（建議電話先預訂） → 葉子庭園餐廳：自駕"}], "food_recommendations": [{"name": "饗吃堡飽優", "description": "安排在 饗吃堡飽優 用餐。"}, {"name": "葉子庭園餐廳", "description": "安排在 葉子庭園餐廳 用餐。"}]}, {"day": "Day 7", "tips": [{"text": "安排停留 巷子裡的小餐館（建議電話先預訂）。"}, {"text": "安排在 林聰明沙鍋魚頭 用餐。"}, {"text": "安排停留 葉子庭園餐廳。"}], "spots": [{"name": "巷子裡的小餐館（建議電話先預訂）", "feature": "安排停留 巷子裡的小餐館（建議電話先預訂）。"}, {"name": "葉子庭園餐廳", "feature": "安排停留 葉子庭園餐廳。"}, {"name": "穀谷", "feature": "安排停留 穀谷。"}], "theme": "巷子裡的小餐館（建議電話先預訂）", "transportation": [{"text": "巷子裡的小餐館（建議電話先預訂） → 林聰明沙鍋魚頭：自駕"}, {"text": "林聰明沙鍋魚頭 → 葉子庭園餐廳：自駕"}, {"text": "葉子庭園餐廳 → 穀谷：自駕"}, {"text": "穀谷 → 穀谷：自駕"}], "food_recommendations": [{"name": "林聰明沙鍋魚頭", "description": "安排在 林聰明沙鍋魚頭 用餐。"}, {"name": "穀谷", "description": "安排在 穀谷 用餐。"}]}, {"day": "Day 8", "tips": [{"text": "安排停留 穀谷。"}, {"text": "安排在 巷子裡的小餐館（建議電話先預訂） 用餐。"}, {"text": "安排停留 三采田美味廚坊/嘉義美食 嘉義餐廳 嘉義小吃 嘉義火鍋 東區美食 嘉義火車站美食。"}], "spots": [{"name": "穀谷", "feature": "安排停留 穀谷。"}, {"name": "三采田美味廚坊/嘉義美食 嘉義餐廳 嘉義小吃 嘉義火鍋 東區美食 嘉義火車站美食", "feature": "安排停留 三采田美味廚坊/嘉義美食 嘉義餐廳 嘉義小吃 嘉義火鍋 東區美食 嘉義火車站美食。"}], "theme": "穀谷", "transportation": [{"text": "穀谷 → 巷子裡的小餐館（建議電話先預訂）：自駕"}, {"text": "巷子裡的小餐館（建議電話先預訂） → 三采田美味廚坊/嘉義美食 嘉義餐廳 嘉義小吃 嘉義火鍋 東區美食 嘉義火車站美食：自駕"}], "food_recommendations": [{"name": "巷子裡的小餐館（建議電話先預訂）", "description": "安排在 巷子裡的小餐館（建議電話先預訂） 用餐。"}]}], "title": "嘉義8天7夜行程規劃", "sources": {"src_001": {"url": "https://www.agoda.com/zh-cn/travel-guides/taiwan/chiayi/3-day-chiayi-itinerary-a-blend-of-culture-nature-and-culinary-delights", "type": "web", "title": "3 天嘉义行程：文化、自然与美食的完美融合", "domain": "agoda.com", "favicon": "https://www.google.com/s2/favicons?domain=agoda.com&sz=64", "snippet": "通过我们的旅行路线，在3 天内探索嘉义最美的风景。从阿里山壮丽的日出到嘉义美味的街头小吃，探索文化、自然和美食。", "language": "zh-TW", "provider": "tavily", "source_id": "src_001", "reliability": "high", "preview_text": "通过我们的旅行路线，在3 天内探索嘉义最美的风景。从阿里山壮丽的日出到嘉义美味的街头小吃，探索文化、自然和美食。", "retrieved_at": "2026-06-04T19:57:27.314Z"}, "src_002": {"url": "https://www.taiwan.net.tw/m1.aspx?sNo=0001033&jid=793", "type": "web", "title": "嘉義市二日遊 > 美食之旅 > 交通部觀光署", "domain": "taiwan.net.tw", "favicon": "https://www.google.com/s2/favicons?domain=taiwan.net.tw&sz=64", "snippet": "本網站使用cookies等相關技術以持續優化網站服務，並有助於為您提供更佳的體驗，當您繼續使用本網站即表示您同意我們的Cookie使用政策。另外，本網站也提供周邊景點自動偵測服務，我們建議您允許本網站取得您的位置資訊，以開啟及使用此智慧化服務。. # 臺灣觀光資訊網｜交通部觀光署. ## 嘉義市二日遊. ### 遊程路線. 建於西元1910年，原名「嘉義公園」，國民政府遷臺後改名「中山公園」，民國86年（西元1997年）又恢復原名。. 嘉義公園位在嘉義市東郊，始建之初，依山仔頂山勢開闢園地，後來又拓寬東西邊的空地，築橋修路，計公園面積約268,000多平方公尺，園內古木參天，涼亭水榭，假山魚池，曲徑通幽，因為利用自然山... 佔地約8.6公頃的樹木園隸屬於農業部林業試驗所，為熱帶經濟樹種之栽植試驗地，兼以母樹園之形態經營，栽植之樹木多屬人文特色的植物，如著名的桃花心木、肯氏南洋杉、黑板樹、巴西橡膠樹…等。. 園區內群樹挺拔林立，自然樸實中充分呈現林場的幽靜氣息，小徑蜿蜒，林蔭蒼鬱，古樸的「林場風清」嘉義八景... 長達四、五百公尺的文化路，白天為車道，晚上則成為夜市，道路兩旁佈滿美味可", "language": "zh-TW", "provider": "tavily", "source_id": "src_002", "reliability": "high", "preview_text": "本網站使用cookies等相關技術以持續優化網站服務，並有助於為您提供更佳的體驗，當您繼續使用本網站即表示您同意我們的Cookie使用政策。另外，本網站也提供周邊景點自動偵測服務，我們建議您允許本網站取得您的位置資訊，以開啟及使用此智慧化服務。. # 臺灣觀光資訊網｜交通部觀光署. ## 嘉義市二日遊. ### 遊程路線. 建於西元1910年，原名「嘉義公園」，國民政府遷臺後改名「中山公園」，民國86年（西元1997年）又恢復原名。. 嘉義公園位在嘉義市東郊，始建之初，依山仔頂山勢開闢園地，後來又拓寬東西邊的空地，築橋修路，計公園面積約268,000多平方公尺，園內古木參天，涼亭水榭，假山魚池，曲徑通幽，因為利用自然山... 佔地約8.6公頃的樹木園隸屬於農業部林業試驗所，為熱帶經濟樹種之栽植試驗地，兼以母樹園之形態經營，栽植之樹木多屬人文特色的植物，如著名的桃花心木、肯氏南洋杉、黑板樹、巴西橡膠樹…等。. 園區內群樹挺拔林立，自然樸實中充分呈現林場的幽靜氣息，小徑蜿蜒，林蔭蒼鬱，古樸的「林場風清」嘉義八景... 長達四、五百公尺的文化路，白天為車道，晚上則成為夜市，道路兩旁佈滿美味可", "retrieved_at": "2026-06-04T19:57:27.314Z"}, "src_003": {"url": "https://www.tripadvisor.com.tw/Attractions-g297904-Activities-c42-t183-Chiayi.html", "type": "web", "title": "嘉義最佳步行遊覽 - Tripadvisor", "domain": "tripadvisor.com.tw", "favicon": "https://www.google.com/s2/favicons?domain=tripadvisor.com.tw&sz=64", "snippet": "「帶有傳統美食的城市自行車之旅」:會騎街頭自行車參觀寺廟、藝術博物館、傳統市場和/或徒步旅行。 \\"Yuanjue山\\":令人難以置信的山景。 要求良好的體能,適當的徒步體驗,沒有", "language": "zh-TW", "provider": "tavily", "source_id": "src_003", "reliability": "high", "preview_text": "「帶有傳統美食的城市自行車之旅」:會騎街頭自行車參觀寺廟、藝術博物館、傳統市場和/或徒步旅行。 \\"Yuanjue山\\":令人難以置信的山景。 要求良好的體能,適當的徒步體驗,沒有", "retrieved_at": "2026-06-04T19:57:27.314Z"}, "src_004": {"url": "https://www.youtube.com/watch?v=oIk6v5PKxuE", "type": "youtube", "title": "嘉義市區免費搭公車玩透透！一日遊包辦東市場美食+城隍廟古蹟+檜 ...", "domain": "youtube.com", "favicon": "https://www.google.com/s2/favicons?domain=youtube.com&sz=64", "snippet": "嘉義#光林我嘉線#台灣好行嘉義台灣好行光林我嘉線115年持電子票證刷卡搭車免費，剛好利用這個優惠讓你在嘉義市區玩透透，交通的部分等於不會花到你的錢，", "language": "zh-TW", "provider": "tavily", "source_id": "src_004", "reliability": "high", "preview_text": "嘉義#光林我嘉線#台灣好行嘉義台灣好行光林我嘉線115年持電子票證刷卡搭車免費，剛好利用這個優惠讓你在嘉義市區玩透透，交通的部分等於不會花到你的錢，", "retrieved_at": "2026-06-04T19:57:27.314Z"}, "src_005": {"url": "https://www.jsimplelife.com/chiayi-trip", "type": "web", "title": "48小時玩嘉義！搭上嘉義市電動公車漫遊3景點、3美食住宿 - JAMIE慢森活", "domain": "jsimplelife.com", "favicon": "https://www.google.com/s2/favicons?domain=jsimplelife.com&sz=64", "snippet": "###### 主題行程, 懶人包, 公車旅行, 文青風, 台灣旅遊, 有間咖啡, 嘉義. # 48小時玩嘉義！搭上嘉義市電動公車漫遊3景點、3美食住宿. ## 嘉義市低底盤電動公車介紹. **今年（2021年）結合環保綠能，嘉義市區公車已於今年全面電動化，以英倫造型風格車身，低底盤、無障礙空間設計，貼近人們生活，領先全台市區，讓公車不只作為市民代步交通工具，更開啟生活各種體驗。**. **嘉義市區電動環保公車，全國產自造、低底盤設計、無障礙空間、具公共服務品質，以及車身結合生活美學設計等，六大特色。活潑與木頭元素，每一部公車皆設計獨一無二的圖案，讓手握木材質拉環，抬頭望著四周，心情都能感到放鬆、愉悅，為全年齡打造樂活和友善的移動空間。**. **目前，嘉義市區低底盤電動環保公車，分為綠線（中山幹線）、紅線（忠孝新民幹線），以及黃線（台灣好行-光林我嘉義縣）全國唯一市區觀光公車， 共3條路線，主要行經機關、學校、購物中心，觀光夜市及休閒景點等。**. **走訪嘉義，旅人們乘車至嘉義火車站，皆可搭到3條路線低地盤電動公車，尖峰時15分鐘就有一台；嘉義市轉運中心站點，則可搭綠線、黃線，一段票", "language": "zh-TW", "provider": "tavily", "source_id": "src_005", "reliability": "high", "preview_text": "###### 主題行程, 懶人包, 公車旅行, 文青風, 台灣旅遊, 有間咖啡, 嘉義. # 48小時玩嘉義！搭上嘉義市電動公車漫遊3景點、3美食住宿. ## 嘉義市低底盤電動公車介紹. **今年（2021年）結合環保綠能，嘉義市區公車已於今年全面電動化，以英倫造型風格車身，低底盤、無障礙空間設計，貼近人們生活，領先全台市區，讓公車不只作為市民代步交通工具，更開啟生活各種體驗。**. **嘉義市區電動環保公車，全國產自造、低底盤設計、無障礙空間、具公共服務品質，以及車身結合生活美學設計等，六大特色。活潑與木頭元素，每一部公車皆設計獨一無二的圖案，讓手握木材質拉環，抬頭望著四周，心情都能感到放鬆、愉悅，為全年齡打造樂活和友善的移動空間。**. **目前，嘉義市區低底盤電動環保公車，分為綠線（中山幹線）、紅線（忠孝新民幹線），以及黃線（台灣好行-光林我嘉義縣）全國唯一市區觀光公車， 共3條路線，主要行經機關、學校、購物中心，觀光夜市及休閒景點等。**. **走訪嘉義，旅人們乘車至嘉義火車站，皆可搭到3條路線低地盤電動公車，尖峰時15分鐘就有一台；嘉義市轉運中心站點，則可搭綠線、黃線，一段票", "retrieved_at": "2026-06-04T19:57:27.314Z"}, "tavily_001": {"url": "https://news.ltn.com.tw/news/life/breakingnews/5378443", "type": "web", "title": "嘉義市推出AI旅遊書結合LINE平台規劃專屬旅遊行程- 生活 - 自由時報", "domain": "news.ltn.com.tw", "favicon": "https://www.google.com/s2/favicons?domain=news.ltn.com.tw&sz=64", "snippet": "此次導入AI技術，將官方帳號化身最懂嘉義的在地旅伴「阿嘉」，民眾輸入如旅遊天數、旅伴類型或偏好的旅遊風格等需求，就能快速分析、生成完整行程建議。", "language": "zh-TW", "provider": "news", "source_id": "tavily_001", "reliability": "low", "preview_text": "此次導入AI技術，將官方帳號化身最懂嘉義的在地旅伴「阿嘉」，民眾輸入如旅遊天數、旅伴類型或偏好的旅遊風格等需求，就能快速分析、生成完整行程建議。", "retrieved_at": "2026-06-04T19:57:23.309Z"}, "tavily_002": {"url": "https://www.travel.com.tw/TOU/TOU0020/TNT0200067", "type": "web", "title": "嘉義阿里山小火車．觀日出2日精緻遊 - 鳳凰旅遊", "domain": "travel.com.tw", "favicon": "https://www.google.com/s2/favicons?domain=travel.com.tw&sz=64", "snippet": "2. 字級：小)中)大). \\\\*住「阿里山閣」之旅客，11月1日起因飯店不再提供早餐，將改贈7-11商品兌換券100元/張(位)，建議旅客可先行於觀日前一天自行至阿里山遊客中心附近7-11購買早餐，或祝山車站旁也有販售熱食可以先買當早餐邊等候日出。. ◎行程：行程車資+早餐1次+午餐1次(奮起湖便當)+晚餐1次+奮起湖+阿里山門票+小火車票(觀日來回+奮起湖-嘉義北門驛單段)+每位正韓KF94立體口罩+人員導覽(簡易導覽非全程). ◎保險：旅行業500萬責任險附加20萬意外醫療險(實支實付)。唯15歲以下、70歲以上之旅客，保險公司只接受最高保額為250萬。. 報名服務專線02-2537-8134 客服專員:劉韋廷 先生 william.liu@phoenix.com.tw. 南港 台北 板橋 桃園 新竹 苗栗 台中 彰化 雲林 台南 高雄. 出發日期：2024/05/28~2024/12/31. 2. 此行程可依當天人數、活動節慶或天候等…因素，由領隊調整行程順序。. 3. 因觀賞日出為不可抗力之自然天侯，貴賓抵達阿里山當日，地接服務人員會視氣候狀況建議來做調整觀日出活動行程及時間，不便之處敬請見諒。. 7. 接駁車基於山路行車及旅客安全考量，恕無提供站位，若有同行成人、幼兒童或嬰兒，請務必於報名或出發前主動告知並支付接駁費用，若未告者恕不提供接駁車位。. (未告知者，若當日接駁", "language": "zh-TW", "provider": "travel", "source_id": "tavily_002", "reliability": "low", "preview_text": "2. 字級：小)中)大). \\\\*住「阿里山閣」之旅客，11月1日起因飯店不再提供早餐，將改贈7-11商品兌換券100元/張(位)，建議旅客可先行於觀日前一天自行至阿里山遊客中心附近7-11購買早餐，或祝山車站旁也有販售熱食可以先買當早餐邊等候日出。. ◎行程：行程車資+早餐1次+午餐1次(奮起湖便當)+晚餐1次+奮起湖+阿里山門票+小火車票(觀日來回+奮起湖-嘉義北門驛單段)+每位正韓KF94立體口罩+人員導覽(簡易導覽非全程). ◎保險：旅行業500萬責任險附加20萬意外醫療險(實支實付)。唯15歲以下、70歲以上之旅客，保險公司只接受最高保額為250萬。. 報名服務專線02-2537-8134 客服專員:劉韋廷 先生 william.liu@phoenix.com.tw. 南港 台北 板橋 桃園 新竹 苗栗 台中 彰化 雲林 台南 高雄. 出發日期：2024/05/28~2024/12/31. 2. 此行程可依當天人數、活動節慶或天候等…因素，由領隊調整行程順序。. 3. 因觀賞日出為不可抗力之自然天侯，貴賓抵達阿里山當日，地接服務人員會視氣候狀況建議來做調整觀日出活動行程及時間，不便之處敬請見諒。. 7. 接駁車基於山路行車及旅客安全考量，恕無提供站位，若有同行成人、幼兒童或嬰兒，請務必於報名或出發前主動告知並支付接駁費用，若未告者恕不提供接駁車位。. (未告知者，若當日接駁", "retrieved_at": "2026-06-04T19:57:23.309Z"}, "tavily_003": {"url": "https://blog.no8.io/chiayicity", "type": "web", "title": "一句話就能排好行程！「今天就回嘉」用AI 旅遊助理重寫城市旅遊體驗", "domain": "blog.no8.io", "favicon": "https://www.google.com/s2/favicons?domain=blog.no8.io&sz=64", "snippet": "嘉義市政府攜手LINE 台灣、SUPER 8 Studio 推出AI 旅遊助理「今天就回嘉」，只需用自然對話就能完成行程規劃、生成專屬旅遊書並直接訂購。", "language": "zh-TW", "provider": "blog", "source_id": "tavily_003", "reliability": "low", "preview_text": "嘉義市政府攜手LINE 台灣、SUPER 8 Studio 推出AI 旅遊助理「今天就回嘉」，只需用自然對話就能完成行程規劃、生成專屬旅遊書並直接訂購。", "retrieved_at": "2026-06-04T19:57:23.309Z"}, "tavily_004": {"url": "https://www.threads.com/@hower0202/post/DUKXuvrE93w/%E5%98%89%E7%BE%A9%E8%BC%95%E8%BB%8C-%E4%BB%A5%E9%98%BF%E9%87%8C%E5%B1%B1%E5%B0%8F%E7%81%AB%E8%BB%8A%E5%BB%B6%E4%BC%B8%E4%BB%A3%E6%9B%BF", "type": "web", "title": "嘉義輕軌以阿里山小火車延伸代替 - Threads", "domain": "threads.com", "favicon": "https://www.google.com/s2/favicons?domain=threads.com&sz=64", "snippet": "當初會規劃BRT，就是因為北港車頭已經無法拉出鐵軌了。去看北興路跟中興路那一帶，糖鐵原有軌道的土地很多都被房子包圍，因此才改為輪胎運輸的", "language": "zh-TW", "provider": "threads", "source_id": "tavily_004", "reliability": "low", "preview_text": "當初會規劃BRT，就是因為北港車頭已經無法拉出鐵軌了。去看北興路跟中興路那一帶，糖鐵原有軌道的土地很多都被房子包圍，因此才改為輪胎運輸的", "retrieved_at": "2026-06-04T19:57:23.309Z"}, "tavily_005": {"url": "https://www.94iprofun.com/product_travel_detail.php?item=292", "type": "web", "title": "阿里山小火車【全線通車/下山】+日出美景二日遊", "domain": "94iprofun.com", "favicon": "https://www.google.com/s2/favicons?domain=94iprofun.com&sz=64", "snippet": "* 2026年 特定日期(6/19、6/20、6/21、9/25、9/26、9/27、9/28、10/9、10/10、10/11、10/24、10/25、10/26、12/25、12/26、12/27、12/31) 出發. 0~2歲幼兒(不佔床位、不佔車位、不含餐) $800/人 3~6歲兒童(不佔床位、佔車位、含餐) $3000/人. 阿里山五大奇景~日出、雲海、晚霞、森林及小火車. * 集合時間及地點：上午09:00 愛玩美旅行社 ( 嘉義火車站後站 ). (如搭乘高鐵者，請上午09:00於嘉義高鐵3號出口集合，需在報名表中備註並支付單程車資100元/人). (旅客搭乘高鐵，可至嘉義火車站後站搭乘免費接駁車BRT前往嘉義高鐵站，班次約莫15~20分鐘一班，車程約30分鐘，建議搭乘高鐵班次為17:30過後). (如需由愛玩美接駁至嘉義高鐵站，請17:10於嘉義火車站大門口集合出發，約17:40左右抵達嘉義高鐵，建議搭乘高鐵班次為18:00過後，需在報名表中備註並支付單程車資100元/人). 1. 住宿可選擇：櫻山飯店(雙人房/四人房)、萬國別館(原木雙人房/景觀四人房)、登山別館(和室雙人房/VIP和室四人房). 2. 進房時間：15:00 PM；退房時間：11:00 AM。(如遇寒暑假、櫻花季、國定假日等特殊假期，請以飯店公告為主。). **09：00**於〔愛玩美旅行社〕集合", "language": "zh-TW", "provider": "94iprofun", "source_id": "tavily_005", "reliability": "low", "preview_text": "* 2026年 特定日期(6/19、6/20、6/21、9/25、9/26、9/27、9/28、10/9、10/10、10/11、10/24、10/25、10/26、12/25、12/26、12/27、12/31) 出發. 0~2歲幼兒(不佔床位、不佔車位、不含餐) $800/人 3~6歲兒童(不佔床位、佔車位、含餐) $3000/人. 阿里山五大奇景~日出、雲海、晚霞、森林及小火車. * 集合時間及地點：上午09:00 愛玩美旅行社 ( 嘉義火車站後站 ). (如搭乘高鐵者，請上午09:00於嘉義高鐵3號出口集合，需在報名表中備註並支付單程車資100元/人). (旅客搭乘高鐵，可至嘉義火車站後站搭乘免費接駁車BRT前往嘉義高鐵站，班次約莫15~20分鐘一班，車程約30分鐘，建議搭乘高鐵班次為17:30過後). (如需由愛玩美接駁至嘉義高鐵站，請17:10於嘉義火車站大門口集合出發，約17:40左右抵達嘉義高鐵，建議搭乘高鐵班次為18:00過後，需在報名表中備註並支付單程車資100元/人). 1. 住宿可選擇：櫻山飯店(雙人房/四人房)、萬國別館(原木雙人房/景觀四人房)、登山別館(和室雙人房/VIP和室四人房). 2. 進房時間：15:00 PM；退房時間：11:00 AM。(如遇寒暑假、櫻花季、國定假日等特殊假期，請以飯店公告為主。). **09：00**於〔愛玩美旅行社〕集合", "retrieved_at": "2026-06-04T19:57:23.309Z"}, "weather_001": {"url": "https://open-meteo.com/en/docs?destination=%E5%98%89%E7%BE%A9&start_date=2026-06-05&end_date=2026-06-12", "type": "weather", "title": "嘉義 天氣預報 2026-06-05", "domain": "open-meteo.com", "favicon": "https://www.google.com/s2/favicons?domain=open-meteo.com&sz=64", "snippet": "2026-06-05：代碼81，降雨機率最高約 100%", "language": "zh-TW", "provider": "open-meteo", "source_id": "weather_001", "reliability": "high", "preview_text": "嘉義 2026-06-05：代碼81，降雨機率最高約 100%", "retrieved_at": "2026-06-04T19:57:24.417Z"}, "weather_002": {"url": "https://open-meteo.com/en/docs?destination=%E5%98%89%E7%BE%A9&start_date=2026-06-05&end_date=2026-06-12", "type": "weather", "title": "嘉義 天氣預報 2026-06-06", "domain": "open-meteo.com", "favicon": "https://www.google.com/s2/favicons?domain=open-meteo.com&sz=64", "snippet": "2026-06-06：代碼82，降雨機率最高約 92%", "language": "zh-TW", "provider": "open-meteo", "source_id": "weather_002", "reliability": "high", "preview_text": "嘉義 2026-06-06：代碼82，降雨機率最高約 92%", "retrieved_at": "2026-06-04T19:57:24.417Z"}, "weather_003": {"url": "https://open-meteo.com/en/docs?destination=%E5%98%89%E7%BE%A9&start_date=2026-06-05&end_date=2026-06-12", "type": "weather", "title": "嘉義 天氣預報 2026-06-07", "domain": "open-meteo.com", "favicon": "https://www.google.com/s2/favicons?domain=open-meteo.com&sz=64", "snippet": "2026-06-07：雷雨，降雨機率最高約 92%", "language": "zh-TW", "provider": "open-meteo", "source_id": "weather_003", "reliability": "high", "preview_text": "嘉義 2026-06-07：雷雨，降雨機率最高約 92%", "retrieved_at": "2026-06-04T19:57:24.417Z"}, "weather_004": {"url": "https://open-meteo.com/en/docs?destination=%E5%98%89%E7%BE%A9&start_date=2026-06-05&end_date=2026-06-12", "type": "weather", "title": "嘉義 天氣預報 2026-06-08", "domain": "open-meteo.com", "favicon": "https://www.google.com/s2/favicons?domain=open-meteo.com&sz=64", "snippet": "2026-06-08：代碼81，降雨機率最高約 100%", "language": "zh-TW", "provider": "open-meteo", "source_id": "weather_004", "reliability": "high", "preview_text": "嘉義 2026-06-08：代碼81，降雨機率最高約 100%", "retrieved_at": "2026-06-04T19:57:24.417Z"}, "weather_005": {"url": "https://open-meteo.com/en/docs?destination=%E5%98%89%E7%BE%A9&start_date=2026-06-05&end_date=2026-06-12", "type": "weather", "title": "嘉義 天氣預報 2026-06-09", "domain": "open-meteo.com", "favicon": "https://www.google.com/s2/favicons?domain=open-meteo.com&sz=64", "snippet": "2026-06-09：代碼81，降雨機率最高約 100%", "language": "zh-TW", "provider": "open-meteo", "source_id": "weather_005", "reliability": "high", "preview_text": "嘉義 2026-06-09：代碼81，降雨機率最高約 100%", "retrieved_at": "2026-06-04T19:57:24.417Z"}, "weather_006": {"url": "https://open-meteo.com/en/docs?destination=%E5%98%89%E7%BE%A9&start_date=2026-06-05&end_date=2026-06-12", "type": "weather", "title": "嘉義 天氣預報 2026-06-10", "domain": "open-meteo.com", "favicon": "https://www.google.com/s2/favicons?domain=open-meteo.com&sz=64", "snippet": "2026-06-10：代碼81，降雨機率最高約 100%", "language": "zh-TW", "provider": "open-meteo", "source_id": "weather_006", "reliability": "high", "preview_text": "嘉義 2026-06-10：代碼81，降雨機率最高約 100%", "retrieved_at": "2026-06-04T19:57:24.417Z"}, "weather_007": {"url": "https://open-meteo.com/en/docs?destination=%E5%98%89%E7%BE%A9&start_date=2026-06-05&end_date=2026-06-12", "type": "weather", "title": "嘉義 天氣預報 2026-06-11", "domain": "open-meteo.com", "favicon": "https://www.google.com/s2/favicons?domain=open-meteo.com&sz=64", "snippet": "2026-06-11：代碼81，降雨機率最高約 100%", "language": "zh-TW", "provider": "open-meteo", "source_id": "weather_007", "reliability": "high", "preview_text": "嘉義 2026-06-11：代碼81，降雨機率最高約 100%", "retrieved_at": "2026-06-04T19:57:24.417Z"}, "weather_008": {"url": "https://open-meteo.com/en/docs?destination=%E5%98%89%E7%BE%A9&start_date=2026-06-05&end_date=2026-06-12", "type": "weather", "title": "嘉義 天氣預報 2026-06-12", "domain": "open-meteo.com", "favicon": "https://www.google.com/s2/favicons?domain=open-meteo.com&sz=64", "snippet": "2026-06-12：代碼81，降雨機率最高約 100%", "language": "zh-TW", "provider": "open-meteo", "source_id": "weather_008", "reliability": "high", "preview_text": "嘉義 2026-06-12：代碼81，降雨機率最高約 100%", "retrieved_at": "2026-06-04T19:57:24.417Z"}}, "revision": {"added_items": [{"day": "Day 1", "time": "10:30", "title": "嘉義七彩冰果室"}, {"day": "Day 1", "time": "12:30", "title": "果然茶香觀光園區｜聚拾光廚房"}, {"day": "Day 1", "time": "14:30", "title": "粉牛樂園"}, {"day": "Day 1", "time": "16:30", "title": "森林之歌"}, {"day": "Day 1", "time": "18:30", "title": "穎覓食光日式料理（嘉義店）"}, {"day": "Day 2", "time": "09:30", "title": "森林之歌"}], "moved_items": [], "revision_id": "rev_mpzx2weq", "changed_days": ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7", "Day 8"], "revised_from": "plan_034mhsa", "removed_items": [], "retimed_items": [], "change_summary": ["交通偏好已調整為自駕導向。", "每日安排總數由 0 個調整為 38 個。", "新增重點：嘉義七彩冰果室、果然茶香觀光園區｜聚拾光廚房、粉牛樂園。"], "based_on_existing_itinerary": true}, "assumptions": [], "event_alerts": [], "response_type": "travel_plan", "summary_table": [{"day": "Day 1", "main_route": "嘉義七彩冰果室 -> 果然茶香觀光園區｜聚拾光廚房 -> 粉牛樂園 -> 森林之歌 -> 穎覓食光日式料理（嘉義店）"}, {"day": "Day 2", "main_route": "森林之歌 -> 舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場 -> 山樣子美食基地 -> 阿肥肥二通食堂 -> 咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店"}, {"day": "Day 3", "main_route": "阿肥肥二通食堂 -> 鮮御快車 嘉義平價美食｜在地美食｜人氣雞湯｜雞湯推薦 -> 果然茶香觀光園區｜聚拾光廚房 -> 舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場 -> 饗吃堡飽優"}, {"day": "Day 4", "main_route": "舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場 -> 穎覓食光日式料理（嘉義店） -> 鮮御快車 嘉義平價美食｜在地美食｜人氣雞湯｜雞湯推薦 -> 穎覓食光日式料理（嘉義店） -> 林聰明沙鍋魚頭"}, {"day": "Day 5", "main_route": "穎覓食光日式料理（嘉義店） -> 咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店 -> 咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店 -> 饗吃堡飽優 -> 巷子裡的小餐館（建議電話先預訂）"}, {"day": "Day 6", "main_route": "饗吃堡飽優 -> 饗吃堡飽優 -> 林聰明沙鍋魚頭 -> 巷子裡的小餐館（建議電話先預訂） -> 葉子庭園餐廳"}, {"day": "Day 7", "main_route": "巷子裡的小餐館（建議電話先預訂） -> 林聰明沙鍋魚頭 -> 葉子庭園餐廳 -> 穀谷 -> 穀谷"}, {"day": "Day 8", "main_route": "穀谷 -> 巷子裡的小餐館（建議電話先預訂） -> 三采田美味廚坊/嘉義美食 嘉義餐廳 嘉義小吃 嘉義火鍋 東區美食 嘉義火車站美食"}], "weather_alerts": [{"day": "2026-06-05", "message": "2026-06-05 降雨機率偏高，建議把戶外景點改成可替代的室內或彈性行程。", "citations": ["weather_001"]}, {"day": "2026-06-06", "message": "2026-06-06 降雨機率偏高，建議把戶外景點改成可替代的室內或彈性行程。", "citations": ["weather_002"]}, {"day": "2026-06-07", "message": "2026-06-07 降雨機率偏高，建議把戶外景點改成可替代的室內或彈性行程。", "citations": ["weather_003"]}]}, "statusSteps": [{"type": "status_step", "label": "理解旅遊需求", "phase": "understand", "status": "completed"}, {"type": "status_step", "label": "規劃查詢範圍", "phase": "plan", "status": "completed"}, {"type": "status_step", "label": "查詢景點、交通與天氣", "phase": "research", "status": "completed"}, {"type": "status_step", "label": "生成完整行程", "phase": "compose", "status": "completed"}], "tripProfile": {"pace": "moderate", "budget": null, "companions": "small_group", "destination": "嘉義", "preferences": ["food", "nature", "city_walk"], "avoid_places": [], "travel_dates": {"end": "2026-06-12", "start": "2026-06-05"}, "accommodation": null, "duration_days": 8, "transportation": "self_drive", "traveler_count": 4, "visited_before": [], "duration_nights": 7, "plan_integration": "direct_merge", "departure_location": null, "special_population": {"has_elderly": false, "has_children": false, "mobility_issue": false}, "disliked_activities": [], "dietary_restrictions": []}, "responseType": "travel_plan"}
\.


--
-- Data for Name: collaboration_presence; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.collaboration_presence (id, "roomId", "userId", "activeSection", "selectedEntityId", online, "lastSeenAt", "cursorX", "cursorY") FROM stdin;
cmpzx2g1t00qzpn8463ygud3l	cmpzx2g0k00qtpn84mfyxq84i	cmpzvydlg0000o17tqskqnik4	workspace	cmpzx2g0c00qrpn84bq927bsc	t	2026-06-05 10:15:10.976	93.2	12.5
cmpzwsz2500aupn84rn23dh73	cmpzwsz1600aopn845fp3xlgv	cmpzvydlg0000o17tqskqnik4	workspace	cmpzwsz0y00ampn84jk9wktky	t	2026-06-04 19:56:56.164	28.6	38.7
cmpzwrvoz008gpn84urb8iryl	cmpzwrvnw008apn84iprb0xlv	cmpzvydlg0000o17tqskqnik4	workspace	cmpzwrvno0088pn84i5k3c5m7	t	2026-06-04 19:49:34.439	\N	\N
cmpzwpb410034pn84eqnimozt	cmpzwpb30002ypn845iembxi4	cmpzvydlg0000o17tqskqnik4	workspace	cmpzwpb2s002wpn84v336roey	t	2026-06-04 19:49:40.85	\N	\N
\.


--
-- Data for Name: collaboration_rooms; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.collaboration_rooms (id, "tripId", "inviteCode", "createdAt", "updatedAt") FROM stdin;
cmpzwpb30002ypn845iembxi4	cmpzwpb2s002wpn84v336roey	AIYO-CMPZWPB2S002WPN84V336ROEY	2026-06-04 19:46:53.149	2026-06-04 19:46:53.149
cmpzwrvnw008apn84iprb0xlv	cmpzwrvno0088pn84i5k3c5m7	AIYO-CMPZWRVNO0088PN84I5K3C5M7	2026-06-04 19:48:53.132	2026-06-04 19:48:53.132
cmpzwsz1600aopn845fp3xlgv	cmpzwsz0y00ampn84jk9wktky	AIYO-CMPZWSZ0Y00AMPN84JK9WKTKY	2026-06-04 19:49:44.155	2026-06-04 19:49:44.155
cmpzx2g0k00qtpn84mfyxq84i	cmpzx2g0c00qrpn84bq927bsc	AIYO-CMPZX2G0C00QRPN84BQ927BSC	2026-06-04 19:57:06.068	2026-06-04 19:57:06.068
\.


--
-- Data for Name: comments; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.comments (id, "roomId", "authorId", content, "createdAt") FROM stdin;
\.


--
-- Data for Name: itinerary_folders; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.itinerary_folders (id, name, "sortOrder", "userId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: map_pins; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.map_pins (id, "tripId", label, lat, lng, description, address, "linkedTripItemId", "dayNumber", "placeId", "photoUrl", thumbnail, "openingHours", "phoneNumber", website, "googleMapsUrl", rating, "userRatingsTotal", color, source, confidence, verified) FROM stdin;
day_2_fallback_2_meal_dinner	cmpzwpb2s002wpn84v336roey	flour + water熊本	32.8027929	130.7100672	安排在 flour + water熊本 用餐。	日本〒860-0808 Kumamoto, Chuo Ward, Tetorihonchō, 5−１ 1F	fallback_4_meal_lunch	4	ChIJZ54wv_L1QDUR9ZyiUJwOYdI	/api/map/place-photo?ref=Ab43m-sY0RmTE2i2a3DHewfbwxT2abFXh5IhaaoGUs11jW1YukLI58f2KtIAzeFgfCmFZShwBeXqtob4rLXYB1knDiMDYtg5TK9n3EoMXrnfz-1QxU1-b3h__VF5gqjEzDp0vmmDdMomrNRWPpaq_AJ9fynZv-Am5LqfqXfZNnHSKNxbXdnY8MK8fV9bFK966hf5C__Mc_XigtB3Dm1cMOl0z_RIEfbNL_J-w-Kxbbz-ZzgzhVCWOrjjcnajDv5dxFQZLW-cALcNSVuJsC4NaSbnj_bgFZZe3pEIoqz0tvDhLOPaZNruNEiZaWp9UFYrS-viB7_8cIIDTmc2Kq6Zfd2Abfe3CtAcXr8dNG18xT7OF0Om0efwfziauA-KxunZXaOq2dBC3zmjD4k3rzelXD40GXqIfoBLlm6TgI2473d_4m8MU02C&maxwidth=480	/api/map/place-photo?ref=Ab43m-sY0RmTE2i2a3DHewfbwxT2abFXh5IhaaoGUs11jW1YukLI58f2KtIAzeFgfCmFZShwBeXqtob4rLXYB1knDiMDYtg5TK9n3EoMXrnfz-1QxU1-b3h__VF5gqjEzDp0vmmDdMomrNRWPpaq_AJ9fynZv-Am5LqfqXfZNnHSKNxbXdnY8MK8fV9bFK966hf5C__Mc_XigtB3Dm1cMOl0z_RIEfbNL_J-w-Kxbbz-ZzgzhVCWOrjjcnajDv5dxFQZLW-cALcNSVuJsC4NaSbnj_bgFZZe3pEIoqz0tvDhLOPaZNruNEiZaWp9UFYrS-viB7_8cIIDTmc2Kq6Zfd2Abfe3CtAcXr8dNG18xT7OF0Om0efwfziauA-KxunZXaOq2dBC3zmjD4k3rzelXD40GXqIfoBLlm6TgI2473d_4m8MU02C&maxwidth=480	星期一: 09:00 – 17:00；星期二: 09:00 – 17:00；星期三: 09:00 – 17:00；星期四: 09:00 – 17:00；星期五: 09:00 – 17:00；星期六: 09:00 – 17:00；星期日: 09:00 – 17:00	096-324-7730	https://www.instagram.com/flour_and_water_kumamoto/	https://maps.google.com/?cid=15159413885236321525	4.5	603	#87CEEB	itinerary	\N	t
day_3_fallback_3_meal_dinner	cmpzwpb2s002wpn84v336roey	山見茶屋	32.8037677	130.7040333	安排在 山見茶屋 用餐。	１-1-2 Ninomaru, Chuo Ward, Kumamoto, 860-0008日本	fallback_5_meal_lunch	5	ChIJ__8D8RL0QDURQAKvKSHNCFw	/api/map/place-photo?ref=Ab43m-umAVs0gtQgJNNv6zpldlIDfOY3sExKyNMPHl2phRjDgoZHfZ4iStjRlo4AYTw1-ioo8oKTys64lt6HmFiZtTktY18y3X-6lWcSKWnSFUBVFnNpk4VHKfJ7QOk7-C8L4RItwswOH7Y10qbDuMm7uTLM-GCPY7i-zFmytj51r2VFRhqKf8FsylLBquUimlveSkb_g__qZDDBi6LRocSP_8w1eH4BoEJrp6QFtpImuUhxUXNqtDP97nVCXg0gS2_vWjiISwvf89Ricy6RLwTpfyJ58XF85_GZOwk6NlVeH4dP49__DO8NXDHDz3-uDSnISEE18TYo8thynqoQZDX7BLZS0LyTcufmDH86LzxsIZtHwqvz2L7VMDzxBzVRBmKV38h3sFt0VwMK_sjcSr9Q_hGm4qevB5CS_Waer4abHWHmNnLfSbjHIuN3liiNR3CI&maxwidth=480	/api/map/place-photo?ref=Ab43m-umAVs0gtQgJNNv6zpldlIDfOY3sExKyNMPHl2phRjDgoZHfZ4iStjRlo4AYTw1-ioo8oKTys64lt6HmFiZtTktY18y3X-6lWcSKWnSFUBVFnNpk4VHKfJ7QOk7-C8L4RItwswOH7Y10qbDuMm7uTLM-GCPY7i-zFmytj51r2VFRhqKf8FsylLBquUimlveSkb_g__qZDDBi6LRocSP_8w1eH4BoEJrp6QFtpImuUhxUXNqtDP97nVCXg0gS2_vWjiISwvf89Ricy6RLwTpfyJ58XF85_GZOwk6NlVeH4dP49__DO8NXDHDz3-uDSnISEE18TYo8thynqoQZDX7BLZS0LyTcufmDH86LzxsIZtHwqvz2L7VMDzxBzVRBmKV38h3sFt0VwMK_sjcSr9Q_hGm4qevB5CS_Waer4abHWHmNnLfSbjHIuN3liiNR3CI&maxwidth=480	星期一: 11:00 – 17:20；星期二: 11:00 – 17:20；星期三: 11:00 – 17:20；星期四: 11:00 – 17:20；星期五: 11:00 – 17:20；星期六: 11:00 – 17:20；星期日: 11:00 – 17:20	096-327-9293	http://yamami-cyaya.com/	https://maps.google.com/?cid=6631775993620005440	4.3	440	#B8D8BA	itinerary	\N	t
day_1_fallback_1_3	cmpzwpb2s002wpn84v336roey	勝烈亭 新市街本店	32.798616	130.705876	安排停留 勝烈亭 新市街本店。	8-18 Shinshigai, Chuo Ward, Kumamoto, 860-0803日本	fallback_6_1	6	ChIJq6pWfnL0QDURDLSaMP-qb3k	/api/map/place-photo?ref=Ab43m-sm5VQIFtbpYn_nO0QySqc-ViOsM0BME-s-sSsbfnx061e3rkpefQNiTUwan3YZu-U_Ry4m-E4TOlcUVnFstH9DOl815tGtAPN4OjVwHn9i7-Td4CSEQReJ-FIXGqi81pC3aDEdu2OricHklfik5DYV6dxpXikOZBIF2VRLvMBXYCQGQiwZW4Dtq_d99wsnRvxBpuyXJyHKAOQnb0HZoLrCfOFtgeN_4iBSASgrQQ5H8Z9G5KG_IKyaitIpwC-a9KMf896zIVcrLlZQ3s2mrHsjAjsS468rZiyOtLwaOTK42ZyaNVg5qRYIICr1nCKEP_YfbMDCHNu503g8qCpLkMMyUY04sKJZxYQ6Ha-lAj5TUGwOL6qPVhHqzeaozHSTQXZSRtL-5rL6eqTnRKd_9o3IS6VLLfThd_0tdlUOgRJkGKwc3C-SvdoWwZmA7Wz-&maxwidth=480	/api/map/place-photo?ref=Ab43m-sm5VQIFtbpYn_nO0QySqc-ViOsM0BME-s-sSsbfnx061e3rkpefQNiTUwan3YZu-U_Ry4m-E4TOlcUVnFstH9DOl815tGtAPN4OjVwHn9i7-Td4CSEQReJ-FIXGqi81pC3aDEdu2OricHklfik5DYV6dxpXikOZBIF2VRLvMBXYCQGQiwZW4Dtq_d99wsnRvxBpuyXJyHKAOQnb0HZoLrCfOFtgeN_4iBSASgrQQ5H8Z9G5KG_IKyaitIpwC-a9KMf896zIVcrLlZQ3s2mrHsjAjsS468rZiyOtLwaOTK42ZyaNVg5qRYIICr1nCKEP_YfbMDCHNu503g8qCpLkMMyUY04sKJZxYQ6Ha-lAj5TUGwOL6qPVhHqzeaozHSTQXZSRtL-5rL6eqTnRKd_9o3IS6VLLfThd_0tdlUOgRJkGKwc3C-SvdoWwZmA7Wz-&maxwidth=480	星期一: 11:00 – 21:30；星期二: 11:00 – 21:30；星期三: 11:00 – 21:30；星期四: 11:00 – 21:30；星期五: 11:00 – 21:30；星期六: 11:00 – 21:30；星期日: 11:00 – 21:30	096-322-8771	https://hayashi-sangyo.jp/	https://maps.google.com/?cid=8750400614012990476	4.5	6102	#B8D8BA	itinerary	\N	t
day_4_fallback_4_3	cmpzwpb2s002wpn84v336roey	Minoru Shokudo AMU Plaza Kumamoto	32.7884654	130.6884596	安排在 Minoru Shokudo AMU Plaza Kumamoto 用餐。	日本〒860-0047 Kumamoto, Nishi Ward, Kasuga, 3-chōme−15−15番26号 アミュプラザくまもと 6F	fallback_6_meal_lunch	6	ChIJFU2GlXf1QDURRVoAkKJW-iE	/api/map/place-photo?ref=Ab43m-s-1eSCKIys-0ESBGJqp0fvmUblUeici_RP9H3p6pOLVlR-8VbcFoGo7sytafamUHdyBqrKO6m4y2CVnfv4We87_1X9Y2NK2bqmWkCuke0ZVgLxXetxQaVkX5GCCICGamwcRXNegR74XpFmi0B9kWmlshbRcLjs2kDrZ0Arqp_Bn_frG55_dJaWRki233-NYHDb0ycwjGdR6KndnVDltXxLgv_eib6yQm1lo86qD8PPzEIMse1sI-upZp9qRVkQ-4zC16ZYNTP2bh5tFG89cuxqFstz3GJSWGX_sTxvmrEt0jbm6qAR2a5NsewiqwmpkXoA_X9vwCO8hp1m9mftZ7lfyGatmLBTWmcQdz4zYpIYAfeG7EfBLL7zBFgTuNugHdOjUEorotb3R9fj8rF9G6Ld2avJeYVEbvUm0-6oLL_NJxls&maxwidth=480	/api/map/place-photo?ref=Ab43m-s-1eSCKIys-0ESBGJqp0fvmUblUeici_RP9H3p6pOLVlR-8VbcFoGo7sytafamUHdyBqrKO6m4y2CVnfv4We87_1X9Y2NK2bqmWkCuke0ZVgLxXetxQaVkX5GCCICGamwcRXNegR74XpFmi0B9kWmlshbRcLjs2kDrZ0Arqp_Bn_frG55_dJaWRki233-NYHDb0ycwjGdR6KndnVDltXxLgv_eib6yQm1lo86qD8PPzEIMse1sI-upZp9qRVkQ-4zC16ZYNTP2bh5tFG89cuxqFstz3GJSWGX_sTxvmrEt0jbm6qAR2a5NsewiqwmpkXoA_X9vwCO8hp1m9mftZ7lfyGatmLBTWmcQdz4zYpIYAfeG7EfBLL7zBFgTuNugHdOjUEorotb3R9fj8rF9G6Ld2avJeYVEbvUm0-6oLL_NJxls&maxwidth=480	星期一: 11:00 – 22:00；星期二: 11:00 – 22:00；星期三: 11:00 – 22:00；星期四: 11:00 – 22:00；星期五: 11:00 – 22:00；星期六: 11:00 – 22:00；星期日: 11:00 – 22:00	096-288-0154	https://www.minoriminoru.jp/	https://maps.google.com/?cid=2448364603629918789	4	248	#FFB347	itinerary	\N	t
day_1_fallback_1_meal_lunch	cmpzwpb2s002wpn84v336roey	熊本屋台村	32.8039537	130.709502	安排停留 熊本屋台村。	2-22 Jōtōmachi, Chuo Ward, Kumamoto, 860-0846日本	fallback_6_3	6	ChIJiwXzCvj1QDUREDoJqSaSBPQ	/api/map/place-photo?ref=Ab43m-sWSIqfH_F7q-lq82T2k3CDb5_raERyMwRzysxjG_C22yWyNLYP-Lsyg8LPxIidGWWkezePa5s6s1F0CPu1nudFAoCtBi7WmVzEvEwjTgDdzKGaY1RGJCacnslq2uh5V9d6HI12o5bxJgslvDbsM4aiX3csOTZ9HHUz5m-Zjo67n79Liw9gSDOro7qkN4OOWszydEj5NibF6FrLOT_cxDRsVkWBhd2F5vbIimOPQsLSwbw0bUtCMBDnkd-VBK4KAR2gcPvD_XYNXBzPczPUpLRaSPl9yGhj3K2Mrl65PuMWrFduExf9Oh1doZklddftqKMgwmqCj-Ah5HyvAwrlMTqpgpUkJvtBckSo7mwRdq2d2YNESZJtMESvBblrY4GXx_nWAkn6XDmOeGiWYQ0EFcEMjq1PuTykXk--Jy4j_yDK1A&maxwidth=480	/api/map/place-photo?ref=Ab43m-sWSIqfH_F7q-lq82T2k3CDb5_raERyMwRzysxjG_C22yWyNLYP-Lsyg8LPxIidGWWkezePa5s6s1F0CPu1nudFAoCtBi7WmVzEvEwjTgDdzKGaY1RGJCacnslq2uh5V9d6HI12o5bxJgslvDbsM4aiX3csOTZ9HHUz5m-Zjo67n79Liw9gSDOro7qkN4OOWszydEj5NibF6FrLOT_cxDRsVkWBhd2F5vbIimOPQsLSwbw0bUtCMBDnkd-VBK4KAR2gcPvD_XYNXBzPczPUpLRaSPl9yGhj3K2Mrl65PuMWrFduExf9Oh1doZklddftqKMgwmqCj-Ah5HyvAwrlMTqpgpUkJvtBckSo7mwRdq2d2YNESZJtMESvBblrY4GXx_nWAkn6XDmOeGiWYQ0EFcEMjq1PuTykXk--Jy4j_yDK1A&maxwidth=480	星期一: 15:00 – 23:30；星期二: 15:00 – 23:30；星期三: 休息；星期四: 15:00 – 23:30；星期五: 15:00 – 23:30；星期六: 12:00 – 23:30；星期日: 12:00 – 23:30	\N	https://kumamotoyataimura.com/?utm_source=google&utm_medium=google_map&utm_campaign=tech_04	https://maps.google.com/?cid=17583339539903625744	3.9	687	#7C9CBF	itinerary	\N	t
day_1_fallback_1_1	cmpzwpb2s002wpn84v336roey	Food Pal熊本	32.8483197	130.6959799	安排在 Food Pal熊本 用餐。	581-2 Mitsugumachi, Kita Ward, Kumamoto, 861-5535日本	fallback_6_meal_dinner	6	ChIJ3Y0aDML2QDURIlLy9B1PO4g	/api/map/place-photo?ref=Ab43m-sgaHcHiJtcCqjYQnIfjSAqWMqIIYBgQQrxx0BMfpDv_hKEdla3Is2DBD-PG95iT9mza7Uuu5gO03vkQ4I3M_1-3F51mE8vGbMPM2l7oxem0axzHg4HKLvYmXVpazZ-SC9oS8gn8mqXuvrzoTSymVJyhzCycXwkM-WBhAZH0yUgZRp7mBaCE64knohHA8r-NKHSQV-cOxVMheT0h-RLtgLI_UCKA0tXeX5vwnKCPp3gNqMh4Lxgb9y_IAxGgzhAlFVs5P52-wh5RtmlP_rBmM8VGRHn58_O0HLHdJ7g-dIxoAetyte_CxFvHeyIQQ0gMj9No2Ke2nYKvnDtFNo4JRMymutfE0aGmzQavcT6a4Yuw1dk3BIx4gqoFF64SfP1MXyci8zbUmgmFrQDTJhewlbJfC99Y7ZNy8zUFnOLv9k&maxwidth=480	/api/map/place-photo?ref=Ab43m-sgaHcHiJtcCqjYQnIfjSAqWMqIIYBgQQrxx0BMfpDv_hKEdla3Is2DBD-PG95iT9mza7Uuu5gO03vkQ4I3M_1-3F51mE8vGbMPM2l7oxem0axzHg4HKLvYmXVpazZ-SC9oS8gn8mqXuvrzoTSymVJyhzCycXwkM-WBhAZH0yUgZRp7mBaCE64knohHA8r-NKHSQV-cOxVMheT0h-RLtgLI_UCKA0tXeX5vwnKCPp3gNqMh4Lxgb9y_IAxGgzhAlFVs5P52-wh5RtmlP_rBmM8VGRHn58_O0HLHdJ7g-dIxoAetyte_CxFvHeyIQQ0gMj9No2Ke2nYKvnDtFNo4JRMymutfE0aGmzQavcT6a4Yuw1dk3BIx4gqoFF64SfP1MXyci8zbUmgmFrQDTJhewlbJfC99Y7ZNy8zUFnOLv9k&maxwidth=480	星期一: 09:00 – 17:00；星期二: 09:00 – 17:00；星期三: 09:00 – 17:00；星期四: 09:00 – 17:00；星期五: 09:00 – 17:00；星期六: 09:00 – 17:00；星期日: 09:00 – 17:00	096-245-5630	http://www.foodpal-kumamoto.jp/	https://maps.google.com/?cid=9816526802866295330	3.4	497	#F4A7B9	itinerary	\N	t
day_2_fallback_2_meal_lunch	cmpzwpb2s002wpn84v336roey	熊本拉麵黑亭 熊本車站本店	32.7861456	130.6917365	安排停留 熊本拉麵黑亭 熊本車站本店。	2-chōme-1-23 Nihongi, Nishi Ward, Kumamoto, 860-0051日本	fallback_7_1	7	ChIJq6oOuPX0QDURYu8_pGXuLfI	/api/map/place-photo?ref=Ab43m-vCKOlFfbVm_72A6Biu-b2ldsIc04rLPpVQv1LdFNNa1hK9zJtrPVLHrBv_c5sbcselBeAcj9QLgALyFm2ZTptHgYuEp91tll5aE6aVdL4xL-SG1WyQWQ21CWDH9xHjRPdsPUV-tgMXRUbeuhPklqWH1C-57FwkoOaDBSf2ID7LByamTPBGTc6jSq1pIKYYLVO1dfgLj_b3bqU4QHB8Bw2PbVvC6DSOY0IL1zMLL3BAPmt0whPAJ6guu5prEMXhL3STv9F0bv0sdC_J7P0WgGJOSyWp6ZCgBipZFRziMiZjqgqAIuNK5avQjMf-75QXHQiLgRtoxpLPqub2IUQXAs7YTrL1es-IIzLHhRXyUGC8CzKrAKHENcwRiZUq95e6CuNImHM-6JIfquj443EHFFUk3MfDq8hCeTi7M-1_Uz2XiPIDaZvdmpE_MJkxhKPM&maxwidth=480	/api/map/place-photo?ref=Ab43m-vCKOlFfbVm_72A6Biu-b2ldsIc04rLPpVQv1LdFNNa1hK9zJtrPVLHrBv_c5sbcselBeAcj9QLgALyFm2ZTptHgYuEp91tll5aE6aVdL4xL-SG1WyQWQ21CWDH9xHjRPdsPUV-tgMXRUbeuhPklqWH1C-57FwkoOaDBSf2ID7LByamTPBGTc6jSq1pIKYYLVO1dfgLj_b3bqU4QHB8Bw2PbVvC6DSOY0IL1zMLL3BAPmt0whPAJ6guu5prEMXhL3STv9F0bv0sdC_J7P0WgGJOSyWp6ZCgBipZFRziMiZjqgqAIuNK5avQjMf-75QXHQiLgRtoxpLPqub2IUQXAs7YTrL1es-IIzLHhRXyUGC8CzKrAKHENcwRiZUq95e6CuNImHM-6JIfquj443EHFFUk3MfDq8hCeTi7M-1_Uz2XiPIDaZvdmpE_MJkxhKPM&maxwidth=480	星期一: 10:30 – 20:30；星期二: 10:30 – 20:30；星期三: 10:30 – 20:30；星期四: 10:30 – 20:30；星期五: 10:30 – 20:30；星期六: 10:30 – 21:00；星期日: 10:30 – 21:00	096-352-1648	http://kokutei.co.jp/	https://maps.google.com/?cid=17450866251445301090	3.9	3431	#FFB347	itinerary	\N	t
day_5_fallback_5_1	cmpzwpb2s002wpn84v336roey	FUJIWARA STEAK HOUSE / 熊本 / 餐廳 / 鐵板燒 / 和牛 / 牛排	32.8014969	130.7101962	安排在 FUJIWARA STEAK HOUSE / 熊本 / 餐廳 / 鐵板燒 / 和牛 / 牛排 用餐。	日本〒860-0801 Kumamoto, Chuo Ward, Anseimachi, 6−２ ダイバシティ3F	fallback_7_meal_lunch	7	ChIJ73VHnb71QDURZ4EbjE2uxFo	/api/map/place-photo?ref=Ab43m-s8BXYG7v70V6_WkL9-96K5YZg-ksWRhzceDG34PFSBVtFieXCjmvOUBSw3MbY1dnjXXamHVflJofmX2D--qKH4ed7TTKywGB90eAz9cKbn4cmZABND-ssBKBAUlqtSEyscmde8E3l9FzjfBbqQ2qagL64XnBz7Uqu7Op0sVXClfl2pA1rYlpd8g4DCGXXK9BKVB5OKs_llbiWGN0wDc3VJLTTYth13uWppLbdWLk1N_gA2WY1ASDFshOQUl7U9aF_1pypI1JvLB7rDHGrElFMOCner1ROYQgpyTtXmPjwlJse4qMiKNzPN9b47b_nMPni1fEQdF9SlOt35D23UpwMg_oVPVUgPwUEgGIednNWrlgjDoqoAKwI8IwIkFEXnFTOjGjnWpNGLnNaBZjlh3qF6It8q7oAKKMMFH1shUCg&maxwidth=480	/api/map/place-photo?ref=Ab43m-s8BXYG7v70V6_WkL9-96K5YZg-ksWRhzceDG34PFSBVtFieXCjmvOUBSw3MbY1dnjXXamHVflJofmX2D--qKH4ed7TTKywGB90eAz9cKbn4cmZABND-ssBKBAUlqtSEyscmde8E3l9FzjfBbqQ2qagL64XnBz7Uqu7Op0sVXClfl2pA1rYlpd8g4DCGXXK9BKVB5OKs_llbiWGN0wDc3VJLTTYth13uWppLbdWLk1N_gA2WY1ASDFshOQUl7U9aF_1pypI1JvLB7rDHGrElFMOCner1ROYQgpyTtXmPjwlJse4qMiKNzPN9b47b_nMPni1fEQdF9SlOt35D23UpwMg_oVPVUgPwUEgGIednNWrlgjDoqoAKwI8IwIkFEXnFTOjGjnWpNGLnNaBZjlh3qF6It8q7oAKKMMFH1shUCg&maxwidth=480	星期一: 17:00 – 22:00；星期二: 17:00 – 22:00；星期三: 17:00 – 22:00；星期四: 17:00 – 22:00；星期五: 17:00 – 22:00；星期六: 17:00 – 22:00；星期日: 17:00 – 22:00	096-355-8778	https://hitosara.com/0020007433/	https://maps.google.com/?cid=6540544206935130471	4.7	35	#87CEEB	itinerary	\N	t
day_1_fallback_1_meal_dinner	cmpzwpb2s002wpn84v336roey	馬肉 SUGANOYA Ginza Street Store	32.8006975	130.7071243	安排停留 馬肉 SUGANOYA Ginza Street Store。	日本〒860-0807 Kumamoto, Chuo Ward, Shimotōri, 1-chōme−9−１ ダイワロイネットホテル 熊本銀座通り PREMIER ２F	fallback_7_3	7	ChIJ8QMSLA30QDURS58RWidtb9c	/api/map/place-photo?ref=Ab43m-tqqfofpDv8CK65o9WDO3kEZwyrLaXQ2KsfCGedwwMGNGu9-ZT2y9lOE30IFs77HozexS_QQjZya6p9xYdmWceVf2dhWEoRfRsd9wnl-Npdr6X6SBDm1CTsSD0gTrqzOLcW1XX48v8z1iHElvciY4P_izsyiIhHXXo0K_ebcRqjvD9ma2W6hIQrU4ZXuRF6nWc0h2rFWFBG-8bdtA4DZDl9sy3wnai_45kObMBbCZkUxBb9kz32Ca1USIta5oCZVzWWzFWePJ1ljvdp7swxHa1NO12USeB0zgtjX7UL2dn3JCHqqL5I2K0U5YUMxgNetNlqsKqtQgqoHjGjN_k31_QkBEk2GlG_Kec9_Z-cXEIBws3Jp6WrEMkfo-WGkCWofgcKDtlu2W6LZU0DPZbreOOS1wPFanb2QxbdFZl-jLcvyx7U0Ct-4s4q35Igjw&maxwidth=480	/api/map/place-photo?ref=Ab43m-tqqfofpDv8CK65o9WDO3kEZwyrLaXQ2KsfCGedwwMGNGu9-ZT2y9lOE30IFs77HozexS_QQjZya6p9xYdmWceVf2dhWEoRfRsd9wnl-Npdr6X6SBDm1CTsSD0gTrqzOLcW1XX48v8z1iHElvciY4P_izsyiIhHXXo0K_ebcRqjvD9ma2W6hIQrU4ZXuRF6nWc0h2rFWFBG-8bdtA4DZDl9sy3wnai_45kObMBbCZkUxBb9kz32Ca1USIta5oCZVzWWzFWePJ1ljvdp7swxHa1NO12USeB0zgtjX7UL2dn3JCHqqL5I2K0U5YUMxgNetNlqsKqtQgqoHjGjN_k31_QkBEk2GlG_Kec9_Z-cXEIBws3Jp6WrEMkfo-WGkCWofgcKDtlu2W6LZU0DPZbreOOS1wPFanb2QxbdFZl-jLcvyx7U0Ct-4s4q35Igjw&maxwidth=480	星期一: 11:30 – 14:30, 17:00 – 22:00；星期二: 11:30 – 14:30, 17:00 – 22:00；星期三: 11:30 – 14:30, 17:00 – 22:00；星期四: 11:30 – 14:30, 17:00 – 22:00；星期五: 11:30 – 14:30, 17:00 – 22:00；星期六: 11:30 – 14:30, 17:00 – 22:00；星期日: 11:30 – 14:30, 17:00 – 22:00	096-312-3618	http://service.suganoya.com/ginzadori/	https://maps.google.com/?cid=15523746456351645515	4.4	1070	#C3B1E1	itinerary	\N	t
day_1_fallback_1_4	cmpzwsz0y00ampn84jk9wktky	芝加哥藝術博物館	41.8796031	-87.6223504	安排停留 芝加哥藝術博物館。	111 S Michigan Ave, Chicago, IL 60603美國	fallback_2_1	2	ChIJlUbZ4qMsDogR3tCinMzzKUg	/api/map/place-photo?ref=Ab43m-tkpRSEd1RHNvk7FVnO4h495_eLDfsxh3v3SNnmKQZPQ0QRcL0Fi_W96CEziSaG9qvX54zWYKJJJlpo5eV-Bj6Bd3Mclwo8wn__bq1SNxv7tA97D8ELoWK22aKp2SmvoMLlz_O1kKL_f_NuNYQDqzJm4jnp72lPLHoRN2FfbOZJ1RnKki1J4hu9L5bDiTuwa2W6a1pnG_kWyU4SSudVZuzCNwBtSSTEnwtxWO48rFZ6sOjkwDdLu0LJE06_3aMMYDQ1jdW0EY0cAduTjJKYDkrE_HC6K5icU-9865RCmJR1nrq0QKFSn6gZ5WeoQ8G-2Ta-KaDPnwo8E4XB-0wpZeoFjKUhcQmx8z6aFXxiquaeYHvPJf7YQBUy19znx7AtfLmGpIuzZVF1M-eFyqPAJF5FIGNu8z9c6repWgeJacr6ug&maxwidth=480	/api/map/place-photo?ref=Ab43m-tkpRSEd1RHNvk7FVnO4h495_eLDfsxh3v3SNnmKQZPQ0QRcL0Fi_W96CEziSaG9qvX54zWYKJJJlpo5eV-Bj6Bd3Mclwo8wn__bq1SNxv7tA97D8ELoWK22aKp2SmvoMLlz_O1kKL_f_NuNYQDqzJm4jnp72lPLHoRN2FfbOZJ1RnKki1J4hu9L5bDiTuwa2W6a1pnG_kWyU4SSudVZuzCNwBtSSTEnwtxWO48rFZ6sOjkwDdLu0LJE06_3aMMYDQ1jdW0EY0cAduTjJKYDkrE_HC6K5icU-9865RCmJR1nrq0QKFSn6gZ5WeoQ8G-2Ta-KaDPnwo8E4XB-0wpZeoFjKUhcQmx8z6aFXxiquaeYHvPJf7YQBUy19znx7AtfLmGpIuzZVF1M-eFyqPAJF5FIGNu8z9c6repWgeJacr6ug&maxwidth=480	星期一: 11:00 – 17:00；星期二: 休息；星期三: 11:00 – 17:00；星期四: 11:00 – 20:00；星期五: 11:00 – 17:00；星期六: 11:00 – 17:00；星期日: 11:00 – 17:00	(312) 443-3600	https://www.artic.edu/	https://maps.google.com/?cid=5199955304902742238	4.8	38032	#C3B1E1	itinerary	\N	t
day_2_fallback_2_3	cmpzwsz0y00ampn84jk9wktky	威利斯大廈	41.8788764	-87.6359149	安排停留 威利斯大廈。	233 S Wacker Dr, Chicago, IL 60606美國	fallback_2_3	2	ChIJu_tp4r4sDogRfYy4Xs5tDwE	/api/map/place-photo?ref=Ab43m-siZ6YRO6314FeHDUReyHGj7QV-YxL5yAPWhRVRWmXews4y_fTFLY8-BBFemj3qRkn8qj_SQGBGcUPyfedLzWqy8NXq-fEhXmzx6NA6j-Gv1tsVRtm29JECUXuNY-FP5l7s0DC-JheDCs1qQUzQOQ9z3Rn8P4oxw1MtskXVnQONJkLmThlBEIMh1UoVpaNS15FZiymEhZuSRJWSZWJI3ksEC5iDV3-cswuztE3IueB9JB7B-MISWQ80S0-3F_VHGnzLwiBAOvu4SiB-ICGsxYBkoebpqJtS-3dwJ3vND0RymHojvSv6KNWtaJUUCbpZq2QHzTRUPorXFShzrrkGUf6kzy-Z1jkIJalEMZL9ZGFPr6_GlNWkG8e0mAyTpsQA_mT0XIPrc7-bED1mWtM_Ow2LUrqptlG4o0iaxZbHMccfQxnR&maxwidth=480	/api/map/place-photo?ref=Ab43m-siZ6YRO6314FeHDUReyHGj7QV-YxL5yAPWhRVRWmXews4y_fTFLY8-BBFemj3qRkn8qj_SQGBGcUPyfedLzWqy8NXq-fEhXmzx6NA6j-Gv1tsVRtm29JECUXuNY-FP5l7s0DC-JheDCs1qQUzQOQ9z3Rn8P4oxw1MtskXVnQONJkLmThlBEIMh1UoVpaNS15FZiymEhZuSRJWSZWJI3ksEC5iDV3-cswuztE3IueB9JB7B-MISWQ80S0-3F_VHGnzLwiBAOvu4SiB-ICGsxYBkoebpqJtS-3dwJ3vND0RymHojvSv6KNWtaJUUCbpZq2QHzTRUPorXFShzrrkGUf6kzy-Z1jkIJalEMZL9ZGFPr6_GlNWkG8e0mAyTpsQA_mT0XIPrc7-bED1mWtM_Ow2LUrqptlG4o0iaxZbHMccfQxnR&maxwidth=480	星期一: 09:00 – 22:00；星期二: 09:00 – 22:00；星期三: 09:00 – 22:00；星期四: 09:00 – 22:00；星期五: 09:00 – 22:00；星期六: 09:00 – 22:00；星期日: 09:00 – 22:00	(312) 875-0066	https://www.willistower.com/	https://maps.google.com/?cid=76400451808431229	4.5	23837	#F4A7B9	itinerary	\N	t
day_2_fallback_2_4	cmpzwsz0y00ampn84jk9wktky	SavorWe	41.8884096	-87.6354498	安排停留 SavorWe。	222 W Merchandise Mart Plaza #1212, Chicago, IL 60654美國	fallback_3_1	3	ChIJ_VRhq_MtDogRgn4fV1AVnb0	/api/map/place-photo?ref=Ab43m-tSVndxyp5wqVWdgb9I61RTyJtUk710VX-Uutns5GwEIvbIUFpuhLICV1iZM4xXJPBcsHauJg5dk1BAWh0h_0516RK9BluI7inAEp5h5XUSEhIUvcSY1G_5r46vkCh-aJLxFvwiKpI-qXg_u86sAJz13CMfls0w9RnLjovwiKZWl3gK8e2eb_JSCcOlPCeLYa0bRuOfFjBlrf4Vph_Hr19D3ReaDAmwowub924c0vjQPKDB0eEcbd0FmBVPKfwLZKtKIW25oN2IX20SEcjTpf3p3-8RXZbAnVLCgxAQ8_Qp0lGdUjis489kdnccbImJBbVvCVEngdsWL2GGdxQiWtOv2KTzEsMqTkJcWI4OfllcMdZfL7oNdI_Qv16SSiEsaUjShGvGUHilPVpya-Zpyxu13DYxz1LQMMbqEDWf9-ANqtXlnLuusUmLcJ2PjlYO&maxwidth=480	/api/map/place-photo?ref=Ab43m-tSVndxyp5wqVWdgb9I61RTyJtUk710VX-Uutns5GwEIvbIUFpuhLICV1iZM4xXJPBcsHauJg5dk1BAWh0h_0516RK9BluI7inAEp5h5XUSEhIUvcSY1G_5r46vkCh-aJLxFvwiKpI-qXg_u86sAJz13CMfls0w9RnLjovwiKZWl3gK8e2eb_JSCcOlPCeLYa0bRuOfFjBlrf4Vph_Hr19D3ReaDAmwowub924c0vjQPKDB0eEcbd0FmBVPKfwLZKtKIW25oN2IX20SEcjTpf3p3-8RXZbAnVLCgxAQ8_Qp0lGdUjis489kdnccbImJBbVvCVEngdsWL2GGdxQiWtOv2KTzEsMqTkJcWI4OfllcMdZfL7oNdI_Qv16SSiEsaUjShGvGUHilPVpya-Zpyxu13DYxz1LQMMbqEDWf9-ANqtXlnLuusUmLcJ2PjlYO&maxwidth=480	星期一: 24 小時營業；星期二: 24 小時營業；星期三: 24 小時營業；星期四: 24 小時營業；星期五: 24 小時營業；星期六: 24 小時營業；星期日: 24 小時營業	(224) 288-7088	https://savorwe.com/	https://maps.google.com/?cid=13663100279315201666	4.8	19	#7C9CBF	itinerary	\N	t
day_3_fallback_3_3	cmpzwsz0y00ampn84jk9wktky	avec Restaurant	41.8842861	-87.643401	安排停留 avec Restaurant。	615 W Randolph St, Chicago, IL 60661美國	fallback_3_3	3	ChIJNYrg38UsDogRP1lxJuC05hw	/api/map/place-photo?ref=Ab43m-sBB0NcN2vlVq-S9BXyRyeIjhVtuPDM6abqe_Fn8hlB_SALSX-5_PBXc1XcvOkdBIwczzeSkFodC6yG_C654c53QCFUwNXqxD0lFWKjfAjneKk7M88M5B0KjeLg8fRhbDSl_ul6L8uZWF8MGha9eroEQGyx7zndt815ZOuIhf49MhD611J0XLq59bELoUQc_jh2ke5pEKcVaXhw1uVSrFYJ5JZ-U5VygC6LTwN3Tmb-ij22ENFsoKvgVtD6ZGhXNGdVsXKS_gKxC8S82JZADo9oAt2Jjs5gE9bSUMyjpt3NL-KeaRpCLmknf-kJgH4CRTwXn0G85B80mq3_L0OCJAPj7fChkNDuKnLwys4thloGlxZ33N86EmmLMgZUD-9JXPKs5m10YC3F5tgpc1Cez93SV-9dtACWYLCn7GElsp1D4A&maxwidth=480	/api/map/place-photo?ref=Ab43m-sBB0NcN2vlVq-S9BXyRyeIjhVtuPDM6abqe_Fn8hlB_SALSX-5_PBXc1XcvOkdBIwczzeSkFodC6yG_C654c53QCFUwNXqxD0lFWKjfAjneKk7M88M5B0KjeLg8fRhbDSl_ul6L8uZWF8MGha9eroEQGyx7zndt815ZOuIhf49MhD611J0XLq59bELoUQc_jh2ke5pEKcVaXhw1uVSrFYJ5JZ-U5VygC6LTwN3Tmb-ij22ENFsoKvgVtD6ZGhXNGdVsXKS_gKxC8S82JZADo9oAt2Jjs5gE9bSUMyjpt3NL-KeaRpCLmknf-kJgH4CRTwXn0G85B80mq3_L0OCJAPj7fChkNDuKnLwys4thloGlxZ33N86EmmLMgZUD-9JXPKs5m10YC3F5tgpc1Cez93SV-9dtACWYLCn7GElsp1D4A&maxwidth=480	星期一: 11:00 – 14:00, 15:30 – 22:00；星期二: 11:00 – 14:00, 15:30 – 22:00；星期三: 11:00 – 14:00, 15:30 – 22:00；星期四: 11:00 – 14:00, 15:30 – 22:00；星期五: 11:00 – 14:00, 15:30 – 23:00；星期六: 10:00 – 14:00, 15:30 – 23:00；星期日: 10:00 – 14:00, 15:30 – 22:00	(312) 377-2002	http://www.avecrestaurant.com/	https://maps.google.com/?cid=2082550752516069695	4.6	2395	#FFB347	itinerary	\N	t
day_3_fallback_3_meal_lunch	cmpzwsz0y00ampn84jk9wktky	Eataly	41.8923302	-87.6262663	安排停留 Eataly。	43 E Ohio St, Chicago, IL 60611美國	fallback_5_1	5	ChIJe_Fq2lctDogRTpK221p4Fmg	/api/map/place-photo?ref=Ab43m-s2d3uuxYeU_wXePkgc3KFZYEA-Ivkkjz17RbBU7PUEpX-TbYdaQL-RGYob-suR9RcjgAJHjQiuVsgpkz3kY019If9XYPggeM6PN5QZOxiZIDRWoaB48Gga12JON0GaHMLWt2zgURI_kO7Ds8yR0Gu_JueZpfQDgJ8ToXlQP9Yq5FdY8NJfTBAXEGeu0yqsa4OBhjJ-40IMXC8rmcMyQcVL95i4B3q4NXVF6UMvz9737IPXTZsXvscLMUTlkXWMkK3nHsZBaIU1FG2Xurab156mEIG-LYmaujLDPgObmYvyyuqGVT-R5rTxRX8JXGJ-lGyezu9esvB8zJog9uD2p38FVNaCNErrm3kzzsspw_oUxGablquk4BeBgXLjZo8wpNc0VKgivgAPs9AJErlRWxFJp5zgGPSkl-lMR8wt5ZNIu-P95TsYssrCT4jaBg&maxwidth=480	/api/map/place-photo?ref=Ab43m-s2d3uuxYeU_wXePkgc3KFZYEA-Ivkkjz17RbBU7PUEpX-TbYdaQL-RGYob-suR9RcjgAJHjQiuVsgpkz3kY019If9XYPggeM6PN5QZOxiZIDRWoaB48Gga12JON0GaHMLWt2zgURI_kO7Ds8yR0Gu_JueZpfQDgJ8ToXlQP9Yq5FdY8NJfTBAXEGeu0yqsa4OBhjJ-40IMXC8rmcMyQcVL95i4B3q4NXVF6UMvz9737IPXTZsXvscLMUTlkXWMkK3nHsZBaIU1FG2Xurab156mEIG-LYmaujLDPgObmYvyyuqGVT-R5rTxRX8JXGJ-lGyezu9esvB8zJog9uD2p38FVNaCNErrm3kzzsspw_oUxGablquk4BeBgXLjZo8wpNc0VKgivgAPs9AJErlRWxFJp5zgGPSkl-lMR8wt5ZNIu-P95TsYssrCT4jaBg&maxwidth=480	星期一: 07:00 – 22:00；星期二: 07:00 – 22:00；星期三: 07:00 – 22:00；星期四: 07:00 – 22:00；星期五: 07:00 – 23:00；星期六: 07:00 – 23:00；星期日: 07:00 – 22:00	(312) 521-8700	https://www.eataly.com/us_en/stores/chicago	https://maps.google.com/?cid=7500314561060704846	4.3	5528	#FFDAB9	itinerary	\N	t
day_6_fallback_6_meal_dinner	cmpzwsz0y00ampn84jk9wktky	MCCB Chicago	41.8538733	-87.6336365	安排在 MCCB Chicago 用餐。	2138 S Archer Ave, Chicago, IL 60616美國	fallback_6_meal_dinner	6	ChIJ-_3liGEsDogR5zjWpg2fFAc	/api/map/place-photo?ref=Ab43m-sxanq8SmwQszT4fmeWb8fFV89MQKEmwbOV4qenpj-v6XiQUlkOB7rRViCa9BbXL3fLR44TnvAqp8ZCTsHNFUugXCloCNNbdA6QmKFwDZ1oaIJ5w-safCNjW-glI-rl7wTbkUjzaOd90qGjA7HBWqLDglHZa9PdpRL0iq6WPhMqheNiNdJUgPQyULLYxkUgKo8UHgR_wAw0xm_L_UHqTXXp2r5rlrTETaKjzgHcEp3qk_NIaWZ3dYtinay9xRNDGGpPzOTaG5sobmgLeHgLV4bJLpve4TcENMuhH-eBkEMv_wcT75hNpqROgzE8M-S56pGDdic44N84zM9Pq-44MyxKO-JiAlVmg603vk60hLbXG8alqAk0so535PHKtTdXfLy_oPN_a1kBs83QxpZY5CYJuDglcKJcLofuCkOdv3fGcw&maxwidth=480	/api/map/place-photo?ref=Ab43m-sxanq8SmwQszT4fmeWb8fFV89MQKEmwbOV4qenpj-v6XiQUlkOB7rRViCa9BbXL3fLR44TnvAqp8ZCTsHNFUugXCloCNNbdA6QmKFwDZ1oaIJ5w-safCNjW-glI-rl7wTbkUjzaOd90qGjA7HBWqLDglHZa9PdpRL0iq6WPhMqheNiNdJUgPQyULLYxkUgKo8UHgR_wAw0xm_L_UHqTXXp2r5rlrTETaKjzgHcEp3qk_NIaWZ3dYtinay9xRNDGGpPzOTaG5sobmgLeHgLV4bJLpve4TcENMuhH-eBkEMv_wcT75hNpqROgzE8M-S56pGDdic44N84zM9Pq-44MyxKO-JiAlVmg603vk60hLbXG8alqAk0so535PHKtTdXfLy_oPN_a1kBs83QxpZY5CYJuDglcKJcLofuCkOdv3fGcw&maxwidth=480	星期一: 12:00 – 21:00；星期二: 休息；星期三: 12:00 – 21:00；星期四: 12:00 – 21:00；星期五: 12:00 – 21:00；星期六: 12:00 – 21:00；星期日: 12:00 – 21:00	(312) 881-0168	http://www.mccbchicago.com/	https://maps.google.com/?cid=510207538782157031	4.5	1360	#87CEEB	itinerary	\N	t
day_4_fallback_4_meal_dinner	cmpzwsz0y00ampn84jk9wktky	Girl & The Goat	41.8841279	-87.6479354	安排停留 Girl & The Goat。	809 W Randolph St, Chicago, IL 60607美國	fallback_7_1	7	ChIJs8mbNsUsDogRUnpg-b_IK5E	/api/map/place-photo?ref=Ab43m-vOgibXtq_hMSVzZSEO6Dme6vl4Ma1ebZYJQgGcWARK_jfJvgcYXcMH1aRxLS8JLDlAashHl77g-sCih6KPO8OWBNTrt7E3exKOlinKGkh0tBK0_MrfqxIIKryZOpN_LO2j0ab_8aiX_c-w8ifRGlt4HV7jgUudnsKHD8bUt-NJBHws-b0hLrPq2nLgjbD-9KidKsC3Aa-_Ku6iz1GPUgCCbVBHZtocmlkThSyX4ZR9EmOCW_bI3B82drVe35lwkaBw6jBniW8OyRnuycvNYlLGff7g2t11fvaHGDmeOo91UutA1pzCTutUioGAmtMrYxpv8ZiaziATXSr_7eF7yYnzVJYHCw-aIH1O-m7Y2YGgqszBmy2LRdWfphTcEpeZ_y4U912k4g-i0hSeFG0A03hVtQ1h_4rAOqV7g_YJ_IHgS2H1&maxwidth=480	/api/map/place-photo?ref=Ab43m-vOgibXtq_hMSVzZSEO6Dme6vl4Ma1ebZYJQgGcWARK_jfJvgcYXcMH1aRxLS8JLDlAashHl77g-sCih6KPO8OWBNTrt7E3exKOlinKGkh0tBK0_MrfqxIIKryZOpN_LO2j0ab_8aiX_c-w8ifRGlt4HV7jgUudnsKHD8bUt-NJBHws-b0hLrPq2nLgjbD-9KidKsC3Aa-_Ku6iz1GPUgCCbVBHZtocmlkThSyX4ZR9EmOCW_bI3B82drVe35lwkaBw6jBniW8OyRnuycvNYlLGff7g2t11fvaHGDmeOo91UutA1pzCTutUioGAmtMrYxpv8ZiaziATXSr_7eF7yYnzVJYHCw-aIH1O-m7Y2YGgqszBmy2LRdWfphTcEpeZ_y4U912k4g-i0hSeFG0A03hVtQ1h_4rAOqV7g_YJ_IHgS2H1&maxwidth=480	星期一: 16:30 – 22:00；星期二: 16:30 – 22:00；星期三: 16:30 – 22:00；星期四: 16:30 – 22:00；星期五: 16:30 – 23:00；星期六: 16:30 – 23:00；星期日: 10:00 – 14:00, 16:30 – 22:00	(312) 492-6262	http://www.girlandthegoat.com/	https://maps.google.com/?cid=10460675286346267218	4.7	7813	#FFB347	itinerary	\N	t
day_5_fallback_5_meal_dinner	cmpzwsz0y00ampn84jk9wktky	The Purple Pig Restaurant	41.890795	-87.6244234	安排停留 The Purple Pig Restaurant。	444 N Michigan Ave Upper Level, Chicago, IL 60611美國	fallback_7_3	7	ChIJl8NTEawsDogRwXH-IVDyH2A	/api/map/place-photo?ref=Ab43m-uW8qI4XEsoBpWsJf25B12yDy-5EvD92BAFjsJ8jFyUuaM1lQyPFcjrtgwPMQ3mplph2obJbNBLlSBCE8O8OT9i5a2NaXBXYM6lxlOAt4sgee2bOePl3uEhpgzsp5lSBRMELyIt59UN4_azU83k6bVVO085tIW4IYCFwEZl9fIjMrrsz1biVo3lV97CWhkGhDy97sX-U8dJkgrop8GFVRIeWKFeQ0DDCcq_njFRAnEN6nMUv0XNDVEvp81BXRarqi8dA8MBC13gl8iZCsXu2K9SYeBbknaiytyUB1HpHi-XJMwgWpURY3bquFo0JEkaywDWhx3tdWpLJsVZ9Qdf5xuIyvwR8SGj1cARBbyjTDvj-B235nNlItFL9xabGBTazEZb4k8lGXakgfk7oPpo7DV-ud7-V9sknZg7pvqahg-fPymlKCNGeJ8isov8pA&maxwidth=480	/api/map/place-photo?ref=Ab43m-uW8qI4XEsoBpWsJf25B12yDy-5EvD92BAFjsJ8jFyUuaM1lQyPFcjrtgwPMQ3mplph2obJbNBLlSBCE8O8OT9i5a2NaXBXYM6lxlOAt4sgee2bOePl3uEhpgzsp5lSBRMELyIt59UN4_azU83k6bVVO085tIW4IYCFwEZl9fIjMrrsz1biVo3lV97CWhkGhDy97sX-U8dJkgrop8GFVRIeWKFeQ0DDCcq_njFRAnEN6nMUv0XNDVEvp81BXRarqi8dA8MBC13gl8iZCsXu2K9SYeBbknaiytyUB1HpHi-XJMwgWpURY3bquFo0JEkaywDWhx3tdWpLJsVZ9Qdf5xuIyvwR8SGj1cARBbyjTDvj-B235nNlItFL9xabGBTazEZb4k8lGXakgfk7oPpo7DV-ud7-V9sknZg7pvqahg-fPymlKCNGeJ8isov8pA&maxwidth=480	星期一: 11:00 – 22:00；星期二: 11:00 – 22:00；星期三: 11:00 – 22:00；星期四: 11:00 – 22:00；星期五: 11:00 – 22:00；星期六: 11:00 – 22:00；星期日: 11:00 – 22:00	(312) 464-1744	https://thepurplepigrestaurantgroup.com/	https://maps.google.com/?cid=6926521177900741057	4.6	7364	#B8D8BA	itinerary	\N	t
day_1_manual_b10111b4-e4a9-4f25-8b9f-e1371e6d525f	cmpzx2g0c00qrpn84bq927bsc	嘉義大學 新民校區	23.4637468	120.4427052	No. 580號, Xinmin Rd, Meiyuan Village, West District, Chiayi City, Taiwan 600	No. 580號, Xinmin Rd, Meiyuan Village, West District, Chiayi City, Taiwan 600	manual_b10111b4-e4a9-4f25-8b9f-e1371e6d525f	1	ChIJr5uO5xiUbjQRA_-dGJ-YouE	/api/map/place-photo?ref=AaVGc3nu-Qeju7eyiEGf_fIDJwfkiUeh-zdt8ow-5NddIRevYIFfQpiO4BmPcpRAYWd53jNQ7U9N0xl9yZBG5tycc355_iaJ6fOijgGzxxCBGW6IBtA7iKMijjTZnkA6CYtY4rkznWc_DBKo7wJJu9bl1ucaS2---P1iXlkW2uolGPMjrgcxh6gwWv-xuk05ysrjT3fwr9MDskEz8rcQ8Yfu6rgA-Y9OMQUv_J4_m2Y2vxIDaGlwJIoK2hgL_02ikZRoVPTXgzbKCWS5vXKmIu9oESG757gHWKATWby5xJVg-d_XVRDTddpo0nsravWKhGEFngJTJVmHHwyxpTdi0lYnrC_rIQubDNYCfSH8mCpKgYJRtAPI_D3hvJwh5eihqy0htkJ-4C2brNjAmQ-z8sscLV61GMDAE1JkkOJG0_-SvNxUNtLo&maxwidth=480	/api/map/place-photo?ref=AaVGc3nu-Qeju7eyiEGf_fIDJwfkiUeh-zdt8ow-5NddIRevYIFfQpiO4BmPcpRAYWd53jNQ7U9N0xl9yZBG5tycc355_iaJ6fOijgGzxxCBGW6IBtA7iKMijjTZnkA6CYtY4rkznWc_DBKo7wJJu9bl1ucaS2---P1iXlkW2uolGPMjrgcxh6gwWv-xuk05ysrjT3fwr9MDskEz8rcQ8Yfu6rgA-Y9OMQUv_J4_m2Y2vxIDaGlwJIoK2hgL_02ikZRoVPTXgzbKCWS5vXKmIu9oESG757gHWKATWby5xJVg-d_XVRDTddpo0nsravWKhGEFngJTJVmHHwyxpTdi0lYnrC_rIQubDNYCfSH8mCpKgYJRtAPI_D3hvJwh5eihqy0htkJ-4C2brNjAmQ-z8sscLV61GMDAE1JkkOJG0_-SvNxUNtLo&maxwidth=480	星期一: 08:00 – 21:45；星期二: 08:00 – 21:45；星期三: 08:00 – 21:45；星期四: 08:00 – 21:45；星期五: 08:00 – 21:45；星期六: 休息；星期日: 休息	05 271 7000	https://www.ncyu.edu.tw/newsite/	https://maps.google.com/?cid=16258725413841141507	4.4	292	#F4A7B9	itinerary	\N	t
day_1_manual_d80fb115-4e0a-4ae4-b201-e93bac924393	cmpzx2g0c00qrpn84bq927bsc	工具車	23.4772956	120.446883	No. 246-1號, Lanjing St, Xirong Village, West District, Chiayi City, Taiwan 600	No. 246-1號, Lanjing St, Xirong Village, West District, Chiayi City, Taiwan 600	manual_d80fb115-4e0a-4ae4-b201-e93bac924393	1	ChIJuRjHqNyVbjQRiDeLtYwWJdw	/api/map/place-photo?ref=AaVGc3m4LrB8-oQXNiYfes3mg7V4ase90iewgj_hWZPkG3McmwgAJI4Xj5CtESjby5iFIg5ck-vVttTaRWvPEHEEElhnzqPyHqrTkVUdLYPhEATEhojVe7DgtQid39V8rEI4VtntuL0nQCuUZQOMDQqJIICSwr_oyV386o-Ma08McaSa0hkO09TbrHeMIjtzN3Z8mHUNYNSjSC3CCB1fjeTIddwla_CvLXlBNeZcrS7RsxJTh4fJewHUjW8d9DAHiG95xzflRfYauuGg5_323xl6mKF8dpLqQTaPUOQeiZeS3PGfhuKeiCkMjHSHVLTycBdI-hH61Ytz-eGvoXZKG5jWPRQOUnyk5DZZZ8K6_7wtxV2yjO8pcDSXbNtnWGdgD7PTzNtYxYB8EHFxe_JpEMTIU8Ckk5pcQ8iIXZwbTX1Orzi5s0M&maxwidth=480	/api/map/place-photo?ref=AaVGc3m4LrB8-oQXNiYfes3mg7V4ase90iewgj_hWZPkG3McmwgAJI4Xj5CtESjby5iFIg5ck-vVttTaRWvPEHEEElhnzqPyHqrTkVUdLYPhEATEhojVe7DgtQid39V8rEI4VtntuL0nQCuUZQOMDQqJIICSwr_oyV386o-Ma08McaSa0hkO09TbrHeMIjtzN3Z8mHUNYNSjSC3CCB1fjeTIddwla_CvLXlBNeZcrS7RsxJTh4fJewHUjW8d9DAHiG95xzflRfYauuGg5_323xl6mKF8dpLqQTaPUOQeiZeS3PGfhuKeiCkMjHSHVLTycBdI-hH61Ytz-eGvoXZKG5jWPRQOUnyk5DZZZ8K6_7wtxV2yjO8pcDSXbNtnWGdgD7PTzNtYxYB8EHFxe_JpEMTIU8Ckk5pcQ8iIXZwbTX1Orzi5s0M&maxwidth=480	星期一: 休息；星期二: 11:00 – 20:00；星期三: 11:00 – 20:00；星期四: 11:00 – 20:00；星期五: 11:00 – 20:00；星期六: 11:00 – 20:00；星期日: 11:00 – 20:00	0989 875 131	https://www.facebook.com/%E5%B7%A5%E5%85%B7%E8%BB%8A%E7%BE%A9%E5%A4%A7%E5%88%A9%E9%BA%B5-2192969084277097/	https://maps.google.com/?cid=15863110056079472520	4.5	313	#7C9CBF	itinerary	\N	t
day_7_fallback_7_4	cmpzx2g0c00qrpn84bq927bsc	穀谷	23.4785788	120.4514206	安排停留 穀谷。	600嘉義市東區中央里興中街132號	fallback_8_1	8	ChIJY-fyOoWVbjQRLtVQ32Btz5s	/api/map/place-photo?ref=Ab43m-tPUI03TcS-fqWUMrHcvMw2F7w8dHxXNDvvEvDQcQKwK33LRzWZVpXkHvQzUdiBvHrKd8wx7pQlhOJDuwMToHzM9dFHBxC19UfJdj78OWTAavgeURbUkftvjXoR8jNhyUm2X2FKZuYeNuZvR4N6m5FIR-i0vVACxjfGb8UcwPr_dYooBN4D6fZGIw6xEtpsC0pkbYMOsa1jJL3tjQ7L4z57qVJdJO9KUNmxkaefzPrEdDhX_PCzyZfgDHXWbS9mBBfNn1t9QDo0p1-FBoHzCwDdZmp-7ObKGbKceJl_gqG0llj0c50-z4RINWR6E_sXcQid1WHp1NfixlpIrI5DSeE-7rC9O9brDs7BlSGG0m3oE9NCv_TxKpGxH_HYTpfXdmdGIu3BUVKcgt1HEA0lsIPj4694rFoFzPBoSq2OHSXSCjSaKscfVDOlgnLEtN8c&maxwidth=480	/api/map/place-photo?ref=Ab43m-tPUI03TcS-fqWUMrHcvMw2F7w8dHxXNDvvEvDQcQKwK33LRzWZVpXkHvQzUdiBvHrKd8wx7pQlhOJDuwMToHzM9dFHBxC19UfJdj78OWTAavgeURbUkftvjXoR8jNhyUm2X2FKZuYeNuZvR4N6m5FIR-i0vVACxjfGb8UcwPr_dYooBN4D6fZGIw6xEtpsC0pkbYMOsa1jJL3tjQ7L4z57qVJdJO9KUNmxkaefzPrEdDhX_PCzyZfgDHXWbS9mBBfNn1t9QDo0p1-FBoHzCwDdZmp-7ObKGbKceJl_gqG0llj0c50-z4RINWR6E_sXcQid1WHp1NfixlpIrI5DSeE-7rC9O9brDs7BlSGG0m3oE9NCv_TxKpGxH_HYTpfXdmdGIu3BUVKcgt1HEA0lsIPj4694rFoFzPBoSq2OHSXSCjSaKscfVDOlgnLEtN8c&maxwidth=480	星期一: 11:00 – 15:01, 17:00 – 21:01；星期二: 11:00 – 15:01, 17:00 – 21:01；星期三: 11:00 – 15:01, 17:00 – 21:01；星期四: 11:00 – 15:01, 17:00 – 21:01；星期五: 11:00 – 15:01, 17:00 – 21:01；星期六: 11:00 – 15:01, 17:00 – 21:01；星期日: 11:00 – 15:01, 17:00 – 21:01	0919 330 115	https://www.facebook.com/goodgoodlifestyle	https://maps.google.com/?cid=11227312658888840494	4.4	1023	#B8D8BA	itinerary	\N	t
day_8_fallback_8_meal_lunch	cmpzx2g0c00qrpn84bq927bsc	巷子裡的小餐館（建議電話先預訂）	23.4763225	120.4449787	安排在 巷子裡的小餐館（建議電話先預訂） 用餐。	600嘉義市西區西榮里延平街373號	fallback_8_meal_lunch	8	ChIJj5FPfi-UbjQR5SME57SkJE4	/api/map/place-photo?ref=Ab43m-uIDxY2GDYFt6iE7PU18UjoSPk5keuWL15ANBfunAL9Fr4ZKQQME7fk4W5hoIW-ovjfzfFzKldgZZjMD3tUD2DQodEFOOEG8hVc_QClvCWYN58arXGOKiunMUGa5HoLc7-plJ0elj4zU5jZld5oQmGMql1Ny7KGyOsYd2i9hgpPzoUVEP16CfkCq-0OzQAw__U3t3JoB-luBPadW2OnC1Hc7yWMfQLh8nnD0xyujcIGPUmPCsvDm_GdMueeaPIzkbPwzQKAlCDr_UHNmuaxJD8S2HF57MVDCSOo44jMHLBwxkWPGWN5-k0MaHFVLZ7CzwFBNnKm9BLWUyJMNX1w6EbWRvg0WsGFP_yUqGftAhKIC_nb8jtMNLE-yUuwjmS56Mffc3J5IGs-LXQ8QUafGFPI7W68W0DjzRDkIY0fPdUqA0UU&maxwidth=480	/api/map/place-photo?ref=Ab43m-uIDxY2GDYFt6iE7PU18UjoSPk5keuWL15ANBfunAL9Fr4ZKQQME7fk4W5hoIW-ovjfzfFzKldgZZjMD3tUD2DQodEFOOEG8hVc_QClvCWYN58arXGOKiunMUGa5HoLc7-plJ0elj4zU5jZld5oQmGMql1Ny7KGyOsYd2i9hgpPzoUVEP16CfkCq-0OzQAw__U3t3JoB-luBPadW2OnC1Hc7yWMfQLh8nnD0xyujcIGPUmPCsvDm_GdMueeaPIzkbPwzQKAlCDr_UHNmuaxJD8S2HF57MVDCSOo44jMHLBwxkWPGWN5-k0MaHFVLZ7CzwFBNnKm9BLWUyJMNX1w6EbWRvg0WsGFP_yUqGftAhKIC_nb8jtMNLE-yUuwjmS56Mffc3J5IGs-LXQ8QUafGFPI7W68W0DjzRDkIY0fPdUqA0UU&maxwidth=480	星期一: 休息；星期二: 11:30 – 14:30, 17:30 – 21:00；星期三: 11:30 – 14:30, 17:30 – 21:00；星期四: 11:30 – 14:30, 17:30 – 21:00；星期五: 11:30 – 14:30, 17:30 – 21:00；星期六: 11:30 – 14:30, 17:30 – 21:00；星期日: 11:30 – 14:30, 17:30 – 21:00	05 223 3737	http://facebook.com/373kitchen	https://maps.google.com/?cid=5630806530996839397	4.6	1817	#7C9CBF	itinerary	\N	t
day_8_fallback_8_3	cmpzx2g0c00qrpn84bq927bsc	三采田美味廚坊/嘉義美食 嘉義餐廳 嘉義小吃 嘉義火鍋 東區美食 嘉義火車站美食	23.4952461	120.4509366	安排停留 三采田美味廚坊/嘉義美食 嘉義餐廳 嘉義小吃 嘉義火鍋 東區美食 嘉義火車站美食。	600嘉義市東區中庄里台斗街217號	fallback_8_3	8	ChIJP5xJE8-VbjQRJLukAcEjdIM	/api/map/place-photo?ref=Ab43m-vHC_NGfSWfHra5h0POXWzob0A1rzyWRKLZqWibUZ_F2jnZ6C6WMjgegRglFftqqfoK7_vXwDQe4JRoK8XStzV4ejAUSocU1E5BOQWsxo1E4a6tMR7F4mPTtx6kL0q8vdwP-eDK6hnPG-OC231PLQ12DgT0nZ92zib0cQ9_ISs7iSkqt116UAyOivhlKtWjDM3iZNJKLMVlpMF6svrS15irtFePr96ohp8RZn7zMiDnZhf9qI9Pm_TewOglCcnQC-NDj0mrmstjthiBg8-y3oudvRg3yrnLn0OuY3lRDttjlv26-vHiKT8Snrr3-cLMSdq-nv93spHz1OU2MjJoTl0A14dl6TBeveG4mjfEHvU_bTiEji5_RXqh1g0f5FB2m44PwTeWyT_9U_nUQTYjDQEgyyDdhMx5Bsc2LHEolape9w&maxwidth=480	/api/map/place-photo?ref=Ab43m-vHC_NGfSWfHra5h0POXWzob0A1rzyWRKLZqWibUZ_F2jnZ6C6WMjgegRglFftqqfoK7_vXwDQe4JRoK8XStzV4ejAUSocU1E5BOQWsxo1E4a6tMR7F4mPTtx6kL0q8vdwP-eDK6hnPG-OC231PLQ12DgT0nZ92zib0cQ9_ISs7iSkqt116UAyOivhlKtWjDM3iZNJKLMVlpMF6svrS15irtFePr96ohp8RZn7zMiDnZhf9qI9Pm_TewOglCcnQC-NDj0mrmstjthiBg8-y3oudvRg3yrnLn0OuY3lRDttjlv26-vHiKT8Snrr3-cLMSdq-nv93spHz1OU2MjJoTl0A14dl6TBeveG4mjfEHvU_bTiEji5_RXqh1g0f5FB2m44PwTeWyT_9U_nUQTYjDQEgyyDdhMx5Bsc2LHEolape9w&maxwidth=480	星期一: 休息；星期二: 休息；星期三: 11:00 – 14:00, 17:00 – 20:00；星期四: 11:00 – 14:00, 17:00 – 20:00；星期五: 11:00 – 14:00, 17:00 – 20:00；星期六: 11:00 – 14:00, 17:00 – 20:00；星期日: 11:00 – 14:00, 17:00 – 20:00	05 276 3785	https://inline.app/booking/-OetL895hPDVb8Zk814C:inline-live-3/-OetL8FA1pr7E0QKPO3I	https://maps.google.com/?cid=9472235228130229028	4.6	617	#FFB347	itinerary	\N	t
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.profiles (id, "userId", budget, destination, preferences) FROM stdin;
cmpzvydlg0001o17txfvhumc6	cmpzvydlg0000o17tqskqnik4	\N	\N	{"interests": [], "activeTripId": "cmpzx2g0c00qrpn84bq927bsc", "welcomeCompleted": true, "preferredTransport": ""}
cmq2enhup0001p97raixrwsat	cmq2enhup0000p97rmqzrn9lp	\N	\N	{"interests": [], "welcomeCompleted": true, "preferredTransport": ""}
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.sessions (id, "sessionToken", "userId", expires) FROM stdin;
\.


--
-- Data for Name: trip_collaborators; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.trip_collaborators (id, "tripId", "userId", role, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: trip_days; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.trip_days (id, "tripId", "dayNumber", theme, summary, "sortOrder") FROM stdin;
cmq0qatce00qqpn7r5b2w4eke	cmpzx2g0c00qrpn84bq927bsc	1	嘉義七彩冰果室	第 1 天以 嘉義七彩冰果室、粉牛樂園、森林之歌 為主。	0
cmq0qatce00qrpn7rm9npexf2	cmpzx2g0c00qrpn84bq927bsc	2	森林之歌	第 2 天以 森林之歌、山樣子美食基地、阿肥肥二通食堂、果然茶香觀光園區｜聚拾光廚房、舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場 為主。	1
cmq0qatce00qspn7rs2kkleef	cmpzx2g0c00qrpn84bq927bsc	3	阿肥肥二通食堂	第 3 天以 阿肥肥二通食堂、果然茶香觀光園區｜聚拾光廚房、舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場、鮮御快車 嘉義平價美食｜在地美食｜人氣雞湯｜雞湯推薦、穎覓食光日式料理（嘉義店） 為主。	2
cmq0qatce00qtpn7r3sjttzfs	cmpzx2g0c00qrpn84bq927bsc	4	舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場	第 4 天以 舊時光新鮮事-老屋咖哩專賣|嘉義美食|午餐推薦|晚餐推薦|寵物友善|火車站美食|文化路美食|企業包場|嘉義包場、鮮御快車 嘉義平價美食｜在地美食｜人氣雞湯｜雞湯推薦、穎覓食光日式料理（嘉義店）、咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店、饗吃堡飽優 為主。	3
cmq0qatce00qupn7r3ufm8o6u	cmpzx2g0c00qrpn84bq927bsc	5	穎覓食光日式料理（嘉義店）	第 5 天以 穎覓食光日式料理（嘉義店）、咖樂彩虹麵-秘製金湯、乾拌麵 嘉義特色餐廳-嘉義市麵食料理|人氣麵店|推薦麻辣麵|特色麵館|必吃麵食|麻辣麵推薦|人氣湯麵|在地推薦麵店、饗吃堡飽優、林聰明沙鍋魚頭、巷子裡的小餐館（建議電話先預訂） 為主。	4
cmpzwq2vq005gpn84dh0ijbwm	cmpzwpb2s002wpn84v336roey	1	Food Pal熊本	第 1 天以 Food Pal熊本、勝烈亭 新市街本店 為主。	0
cmpzwq2vq005hpn848jpg0jrl	cmpzwpb2s002wpn84v336roey	2	熊本屋台村	第 2 天以 熊本屋台村、熊本拉麵黑亭 熊本車站本店 為主。	1
cmpzwq2vq005ipn84jmpw0zsu	cmpzwpb2s002wpn84v336roey	3	馬肉 SUGANOYA Ginza Street Store	第 3 天以 馬肉 SUGANOYA Ginza Street Store、flour + water熊本 為主。	2
cmpzwq2vq005jpn84vbw6zyyr	cmpzwpb2s002wpn84v336roey	4	山見茶屋	第 4 天以 山見茶屋、Minoru Shokudo AMU Plaza Kumamoto 為主。	3
cmpzwq2vq005kpn84lwloic9q	cmpzwpb2s002wpn84v336roey	5	FUJIWARA STEAK HOUSE / 熊本 / 餐廳 / 鐵板燒 / 和牛 / 牛排	第 5 天以 FUJIWARA STEAK HOUSE / 熊本 / 餐廳 / 鐵板燒 / 和牛 / 牛排、Food Pal熊本 為主。	4
cmpzwq2vq005lpn848ti465vt	cmpzwpb2s002wpn84v336roey	6	勝烈亭 新市街本店	第 6 天以 勝烈亭 新市街本店、熊本屋台村 為主。	5
cmpzwq2vq005mpn84s99gz7e2	cmpzwpb2s002wpn84v336roey	7	熊本拉麵黑亭 熊本車站本店	第 7 天以 熊本拉麵黑亭 熊本車站本店、馬肉 SUGANOYA Ginza Street Store 為主。	6
cmpzwv78n00efpn84677vp994	cmpzwsz0y00ampn84jk9wktky	1	雲門	第 1 天以 雲門、寫第水族館、芝加哥藝術博物館 為主。	0
cmpzwv78n00egpn847bj17etc	cmpzwsz0y00ampn84jk9wktky	2	芝加哥藝術博物館	第 2 天以 芝加哥藝術博物館、威利斯大廈、SavorWe、avec Restaurant、Giordano's 為主。	1
cmpzwv78n00ehpn84x17ifry1	cmpzwsz0y00ampn84jk9wktky	3	SavorWe	第 3 天以 SavorWe、avec Restaurant、Giordano's、The Dearborn、Eataly 為主。	2
cmpzwv78n00eipn84moxhish1	cmpzwsz0y00ampn84jk9wktky	4	Giordano's	第 4 天以 Giordano's、The Dearborn、Eataly、Eleven City Diner、Soul Vibez - Chicago 為主。	3
cmpzwv78n00ejpn84wq5zzfg0	cmpzwsz0y00ampn84jk9wktky	5	Eataly	第 5 天以 Eataly、Eleven City Diner、Soul Vibez - Chicago、Jibaritos y Más、Girl & The Goat 為主。	4
cmpzwv78n00ekpn84opjjvjs4	cmpzwsz0y00ampn84jk9wktky	6	Soul Vibez - Chicago	第 6 天以 Soul Vibez - Chicago、Jibaritos y Más、Girl & The Goat、The Purple Pig Restaurant、MCCB Chicago 為主。	5
cmpzwv78n00elpn84b2uplt35	cmpzwsz0y00ampn84jk9wktky	7	Girl & The Goat	第 7 天以 Girl & The Goat、The Purple Pig Restaurant、MCCB Chicago、Qing Xiang Yuan Dumplings 為主。	6
cmq0qatce00qvpn7rha8oz639	cmpzx2g0c00qrpn84bq927bsc	6	饗吃堡飽優	第 6 天以 饗吃堡飽優、林聰明沙鍋魚頭、巷子裡的小餐館（建議電話先預訂）、葉子庭園餐廳、穀谷 為主。	5
cmq0qatce00qwpn7ra7vk7a8l	cmpzx2g0c00qrpn84bq927bsc	7	巷子裡的小餐館（建議電話先預訂）	第 7 天以 巷子裡的小餐館（建議電話先預訂）、葉子庭園餐廳、穀谷、三采田美味廚坊/嘉義美食 嘉義餐廳 嘉義小吃 嘉義火鍋 東區美食 嘉義火車站美食、廢溫室Greenhouse café 為主。	6
cmq0qatce00qxpn7r8r6fpyvl	cmpzx2g0c00qrpn84bq927bsc	8	穀谷	第 8 天以 穀谷、三采田美味廚坊/嘉義美食 嘉義餐廳 嘉義小吃 嘉義火鍋 東區美食 嘉義火車站美食、廢溫室Greenhouse café、嘉義七彩冰果室 為主。	7
\.


--
-- Data for Name: trip_items; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.trip_items (id, "tripId", day, title, description, "timeSlot", location, latitude, longitude, "order", "itemType", source, "locationDesc", "locationAddress", "placeId", "photoUrl", thumbnail, "openingHours", "phoneNumber", website, "googleMapsUrl", rating, "userRatingsTotal", confidence, verified, "transportMode", "transportDurationMinutes", "transportDistanceMeters", "transportDataSource") FROM stdin;
fallback_1_1	cmpzwpb2s002wpn84v336roey	1	Food Pal熊本	安排停留 Food Pal熊本。	10:30	Food Pal熊本	32.8483197	130.6959799	0	attraction	ai	熊本 建議停留點	581-2 Mitsugumachi, Kita Ward, Kumamoto, 861-5535日本	ChIJ3Y0aDML2QDURIlLy9B1PO4g	/api/map/place-photo?ref=Ab43m-sgaHcHiJtcCqjYQnIfjSAqWMqIIYBgQQrxx0BMfpDv_hKEdla3Is2DBD-PG95iT9mza7Uuu5gO03vkQ4I3M_1-3F51mE8vGbMPM2l7oxem0axzHg4HKLvYmXVpazZ-SC9oS8gn8mqXuvrzoTSymVJyhzCycXwkM-WBhAZH0yUgZRp7mBaCE64knohHA8r-NKHSQV-cOxVMheT0h-RLtgLI_UCKA0tXeX5vwnKCPp3gNqMh4Lxgb9y_IAxGgzhAlFVs5P52-wh5RtmlP_rBmM8VGRHn58_O0HLHdJ7g-dIxoAetyte_CxFvHeyIQQ0gMj9No2Ke2nYKvnDtFNo4JRMymutfE0aGmzQavcT6a4Yuw1dk3BIx4gqoFF64SfP1MXyci8zbUmgmFrQDTJhewlbJfC99Y7ZNy8zUFnOLv9k&maxwidth=480	/api/map/place-photo?ref=Ab43m-sgaHcHiJtcCqjYQnIfjSAqWMqIIYBgQQrxx0BMfpDv_hKEdla3Is2DBD-PG95iT9mza7Uuu5gO03vkQ4I3M_1-3F51mE8vGbMPM2l7oxem0axzHg4HKLvYmXVpazZ-SC9oS8gn8mqXuvrzoTSymVJyhzCycXwkM-WBhAZH0yUgZRp7mBaCE64knohHA8r-NKHSQV-cOxVMheT0h-RLtgLI_UCKA0tXeX5vwnKCPp3gNqMh4Lxgb9y_IAxGgzhAlFVs5P52-wh5RtmlP_rBmM8VGRHn58_O0HLHdJ7g-dIxoAetyte_CxFvHeyIQQ0gMj9No2Ke2nYKvnDtFNo4JRMymutfE0aGmzQavcT6a4Yuw1dk3BIx4gqoFF64SfP1MXyci8zbUmgmFrQDTJhewlbJfC99Y7ZNy8zUFnOLv9k&maxwidth=480	星期一: 09:00 – 17:00；星期二: 09:00 – 17:00；星期三: 09:00 – 17:00；星期四: 09:00 – 17:00；星期五: 09:00 – 17:00；星期六: 09:00 – 17:00；星期日: 09:00 – 17:00	096-245-5630	http://www.foodpal-kumamoto.jp/	https://maps.google.com/?cid=9816526802866295330	3.4	497	\N	t	\N	\N	\N	\N
fallback_1_meal_lunch	cmpzwpb2s002wpn84v336roey	1	熊本屋台村	安排在 熊本屋台村 用餐。	12:30	熊本屋台村	32.8039537	130.709502	1	restaurant	ai	熊本 lunch	2-22 Jōtōmachi, Chuo Ward, Kumamoto, 860-0846日本	ChIJiwXzCvj1QDUREDoJqSaSBPQ	/api/map/place-photo?ref=Ab43m-sWSIqfH_F7q-lq82T2k3CDb5_raERyMwRzysxjG_C22yWyNLYP-Lsyg8LPxIidGWWkezePa5s6s1F0CPu1nudFAoCtBi7WmVzEvEwjTgDdzKGaY1RGJCacnslq2uh5V9d6HI12o5bxJgslvDbsM4aiX3csOTZ9HHUz5m-Zjo67n79Liw9gSDOro7qkN4OOWszydEj5NibF6FrLOT_cxDRsVkWBhd2F5vbIimOPQsLSwbw0bUtCMBDnkd-VBK4KAR2gcPvD_XYNXBzPczPUpLRaSPl9yGhj3K2Mrl65PuMWrFduExf9Oh1doZklddftqKMgwmqCj-Ah5HyvAwrlMTqpgpUkJvtBckSo7mwRdq2d2YNESZJtMESvBblrY4GXx_nWAkn6XDmOeGiWYQ0EFcEMjq1PuTykXk--Jy4j_yDK1A&maxwidth=480	/api/map/place-photo?ref=Ab43m-sWSIqfH_F7q-lq82T2k3CDb5_raERyMwRzysxjG_C22yWyNLYP-Lsyg8LPxIidGWWkezePa5s6s1F0CPu1nudFAoCtBi7WmVzEvEwjTgDdzKGaY1RGJCacnslq2uh5V9d6HI12o5bxJgslvDbsM4aiX3csOTZ9HHUz5m-Zjo67n79Liw9gSDOro7qkN4OOWszydEj5NibF6FrLOT_cxDRsVkWBhd2F5vbIimOPQsLSwbw0bUtCMBDnkd-VBK4KAR2gcPvD_XYNXBzPczPUpLRaSPl9yGhj3K2Mrl65PuMWrFduExf9Oh1doZklddftqKMgwmqCj-Ah5HyvAwrlMTqpgpUkJvtBckSo7mwRdq2d2YNESZJtMESvBblrY4GXx_nWAkn6XDmOeGiWYQ0EFcEMjq1PuTykXk--Jy4j_yDK1A&maxwidth=480	星期一: 15:00 – 23:30；星期二: 15:00 – 23:30；星期三: 休息；星期四: 15:00 – 23:30；星期五: 15:00 – 23:30；星期六: 12:00 – 23:30；星期日: 12:00 – 23:30	\N	https://kumamotoyataimura.com/?utm_source=google&utm_medium=google_map&utm_campaign=tech_04	https://maps.google.com/?cid=17583339539903625744	3.9	687	\N	t	self_drive	\N	\N	\N
fallback_1_3	cmpzwpb2s002wpn84v336roey	1	勝烈亭 新市街本店	安排停留 勝烈亭 新市街本店。	14:30	勝烈亭 新市街本店	32.798616	130.705876	2	activity	ai	熊本 建議停留點	8-18 Shinshigai, Chuo Ward, Kumamoto, 860-0803日本	ChIJq6pWfnL0QDURDLSaMP-qb3k	/api/map/place-photo?ref=Ab43m-sm5VQIFtbpYn_nO0QySqc-ViOsM0BME-s-sSsbfnx061e3rkpefQNiTUwan3YZu-U_Ry4m-E4TOlcUVnFstH9DOl815tGtAPN4OjVwHn9i7-Td4CSEQReJ-FIXGqi81pC3aDEdu2OricHklfik5DYV6dxpXikOZBIF2VRLvMBXYCQGQiwZW4Dtq_d99wsnRvxBpuyXJyHKAOQnb0HZoLrCfOFtgeN_4iBSASgrQQ5H8Z9G5KG_IKyaitIpwC-a9KMf896zIVcrLlZQ3s2mrHsjAjsS468rZiyOtLwaOTK42ZyaNVg5qRYIICr1nCKEP_YfbMDCHNu503g8qCpLkMMyUY04sKJZxYQ6Ha-lAj5TUGwOL6qPVhHqzeaozHSTQXZSRtL-5rL6eqTnRKd_9o3IS6VLLfThd_0tdlUOgRJkGKwc3C-SvdoWwZmA7Wz-&maxwidth=480	/api/map/place-photo?ref=Ab43m-sm5VQIFtbpYn_nO0QySqc-ViOsM0BME-s-sSsbfnx061e3rkpefQNiTUwan3YZu-U_Ry4m-E4TOlcUVnFstH9DOl815tGtAPN4OjVwHn9i7-Td4CSEQReJ-FIXGqi81pC3aDEdu2OricHklfik5DYV6dxpXikOZBIF2VRLvMBXYCQGQiwZW4Dtq_d99wsnRvxBpuyXJyHKAOQnb0HZoLrCfOFtgeN_4iBSASgrQQ5H8Z9G5KG_IKyaitIpwC-a9KMf896zIVcrLlZQ3s2mrHsjAjsS468rZiyOtLwaOTK42ZyaNVg5qRYIICr1nCKEP_YfbMDCHNu503g8qCpLkMMyUY04sKJZxYQ6Ha-lAj5TUGwOL6qPVhHqzeaozHSTQXZSRtL-5rL6eqTnRKd_9o3IS6VLLfThd_0tdlUOgRJkGKwc3C-SvdoWwZmA7Wz-&maxwidth=480	星期一: 11:00 – 21:30；星期二: 11:00 – 21:30；星期三: 11:00 – 21:30；星期四: 11:00 – 21:30；星期五: 11:00 – 21:30；星期六: 11:00 – 21:30；星期日: 11:00 – 21:30	096-322-8771	https://hayashi-sangyo.jp/	https://maps.google.com/?cid=8750400614012990476	4.5	6102	\N	t	self_drive	\N	\N	\N
fallback_1_meal_dinner	cmpzwpb2s002wpn84v336roey	1	馬肉 SUGANOYA Ginza Street Store	安排在 馬肉 SUGANOYA Ginza Street Store 用餐。	18:30	馬肉 SUGANOYA Ginza Street Store	32.8006975	130.7071243	3	restaurant	ai	熊本 dinner	日本〒860-0807 Kumamoto, Chuo Ward, Shimotōri, 1-chōme−9−１ ダイワロイネットホテル 熊本銀座通り PREMIER ２F	ChIJ8QMSLA30QDURS58RWidtb9c	/api/map/place-photo?ref=Ab43m-tqqfofpDv8CK65o9WDO3kEZwyrLaXQ2KsfCGedwwMGNGu9-ZT2y9lOE30IFs77HozexS_QQjZya6p9xYdmWceVf2dhWEoRfRsd9wnl-Npdr6X6SBDm1CTsSD0gTrqzOLcW1XX48v8z1iHElvciY4P_izsyiIhHXXo0K_ebcRqjvD9ma2W6hIQrU4ZXuRF6nWc0h2rFWFBG-8bdtA4DZDl9sy3wnai_45kObMBbCZkUxBb9kz32Ca1USIta5oCZVzWWzFWePJ1ljvdp7swxHa1NO12USeB0zgtjX7UL2dn3JCHqqL5I2K0U5YUMxgNetNlqsKqtQgqoHjGjN_k31_QkBEk2GlG_Kec9_Z-cXEIBws3Jp6WrEMkfo-WGkCWofgcKDtlu2W6LZU0DPZbreOOS1wPFanb2QxbdFZl-jLcvyx7U0Ct-4s4q35Igjw&maxwidth=480	/api/map/place-photo?ref=Ab43m-tqqfofpDv8CK65o9WDO3kEZwyrLaXQ2KsfCGedwwMGNGu9-ZT2y9lOE30IFs77HozexS_QQjZya6p9xYdmWceVf2dhWEoRfRsd9wnl-Npdr6X6SBDm1CTsSD0gTrqzOLcW1XX48v8z1iHElvciY4P_izsyiIhHXXo0K_ebcRqjvD9ma2W6hIQrU4ZXuRF6nWc0h2rFWFBG-8bdtA4DZDl9sy3wnai_45kObMBbCZkUxBb9kz32Ca1USIta5oCZVzWWzFWePJ1ljvdp7swxHa1NO12USeB0zgtjX7UL2dn3JCHqqL5I2K0U5YUMxgNetNlqsKqtQgqoHjGjN_k31_QkBEk2GlG_Kec9_Z-cXEIBws3Jp6WrEMkfo-WGkCWofgcKDtlu2W6LZU0DPZbreOOS1wPFanb2QxbdFZl-jLcvyx7U0Ct-4s4q35Igjw&maxwidth=480	星期一: 11:30 – 14:30, 17:00 – 22:00；星期二: 11:30 – 14:30, 17:00 – 22:00；星期三: 11:30 – 14:30, 17:00 – 22:00；星期四: 11:30 – 14:30, 17:00 – 22:00；星期五: 11:30 – 14:30, 17:00 – 22:00；星期六: 11:30 – 14:30, 17:00 – 22:00；星期日: 11:30 – 14:30, 17:00 – 22:00	096-312-3618	http://service.suganoya.com/ginzadori/	https://maps.google.com/?cid=15523746456351645515	4.4	1070	\N	t	self_drive	\N	\N	\N
fallback_2_1	cmpzwpb2s002wpn84v336roey	2	熊本屋台村	安排停留 熊本屋台村。	09:30	熊本屋台村	32.8039537	130.709502	0	attraction	ai	熊本 建議停留點	2-22 Jōtōmachi, Chuo Ward, Kumamoto, 860-0846日本	ChIJiwXzCvj1QDUREDoJqSaSBPQ	/api/map/place-photo?ref=Ab43m-sWSIqfH_F7q-lq82T2k3CDb5_raERyMwRzysxjG_C22yWyNLYP-Lsyg8LPxIidGWWkezePa5s6s1F0CPu1nudFAoCtBi7WmVzEvEwjTgDdzKGaY1RGJCacnslq2uh5V9d6HI12o5bxJgslvDbsM4aiX3csOTZ9HHUz5m-Zjo67n79Liw9gSDOro7qkN4OOWszydEj5NibF6FrLOT_cxDRsVkWBhd2F5vbIimOPQsLSwbw0bUtCMBDnkd-VBK4KAR2gcPvD_XYNXBzPczPUpLRaSPl9yGhj3K2Mrl65PuMWrFduExf9Oh1doZklddftqKMgwmqCj-Ah5HyvAwrlMTqpgpUkJvtBckSo7mwRdq2d2YNESZJtMESvBblrY4GXx_nWAkn6XDmOeGiWYQ0EFcEMjq1PuTykXk--Jy4j_yDK1A&maxwidth=480	/api/map/place-photo?ref=Ab43m-sWSIqfH_F7q-lq82T2k3CDb5_raERyMwRzysxjG_C22yWyNLYP-Lsyg8LPxIidGWWkezePa5s6s1F0CPu1nudFAoCtBi7WmVzEvEwjTgDdzKGaY1RGJCacnslq2uh5V9d6HI12o5bxJgslvDbsM4aiX3csOTZ9HHUz5m-Zjo67n79Liw9gSDOro7qkN4OOWszydEj5NibF6FrLOT_cxDRsVkWBhd2F5vbIimOPQsLSwbw0bUtCMBDnkd-VBK4KAR2gcPvD_XYNXBzPczPUpLRaSPl9yGhj3K2Mrl65PuMWrFduExf9Oh1doZklddftqKMgwmqCj-Ah5HyvAwrlMTqpgpUkJvtBckSo7mwRdq2d2YNESZJtMESvBblrY4GXx_nWAkn6XDmOeGiWYQ0EFcEMjq1PuTykXk--Jy4j_yDK1A&maxwidth=480	星期一: 15:00 – 23:30；星期二: 15:00 – 23:30；星期三: 休息；星期四: 15:00 – 23:30；星期五: 15:00 – 23:30；星期六: 12:00 – 23:30；星期日: 12:00 – 23:30	\N	https://kumamotoyataimura.com/?utm_source=google&utm_medium=google_map&utm_campaign=tech_04	https://maps.google.com/?cid=17583339539903625744	3.9	687	\N	t	\N	\N	\N	\N
fallback_2_meal_lunch	cmpzwpb2s002wpn84v336roey	2	熊本拉麵黑亭 熊本車站本店	安排在 熊本拉麵黑亭 熊本車站本店 用餐。	12:30	熊本拉麵黑亭 熊本車站本店	32.7861456	130.6917365	1	restaurant	ai	熊本 lunch	2-chōme-1-23 Nihongi, Nishi Ward, Kumamoto, 860-0051日本	ChIJq6oOuPX0QDURYu8_pGXuLfI	/api/map/place-photo?ref=Ab43m-vCKOlFfbVm_72A6Biu-b2ldsIc04rLPpVQv1LdFNNa1hK9zJtrPVLHrBv_c5sbcselBeAcj9QLgALyFm2ZTptHgYuEp91tll5aE6aVdL4xL-SG1WyQWQ21CWDH9xHjRPdsPUV-tgMXRUbeuhPklqWH1C-57FwkoOaDBSf2ID7LByamTPBGTc6jSq1pIKYYLVO1dfgLj_b3bqU4QHB8Bw2PbVvC6DSOY0IL1zMLL3BAPmt0whPAJ6guu5prEMXhL3STv9F0bv0sdC_J7P0WgGJOSyWp6ZCgBipZFRziMiZjqgqAIuNK5avQjMf-75QXHQiLgRtoxpLPqub2IUQXAs7YTrL1es-IIzLHhRXyUGC8CzKrAKHENcwRiZUq95e6CuNImHM-6JIfquj443EHFFUk3MfDq8hCeTi7M-1_Uz2XiPIDaZvdmpE_MJkxhKPM&maxwidth=480	/api/map/place-photo?ref=Ab43m-vCKOlFfbVm_72A6Biu-b2ldsIc04rLPpVQv1LdFNNa1hK9zJtrPVLHrBv_c5sbcselBeAcj9QLgALyFm2ZTptHgYuEp91tll5aE6aVdL4xL-SG1WyQWQ21CWDH9xHjRPdsPUV-tgMXRUbeuhPklqWH1C-57FwkoOaDBSf2ID7LByamTPBGTc6jSq1pIKYYLVO1dfgLj_b3bqU4QHB8Bw2PbVvC6DSOY0IL1zMLL3BAPmt0whPAJ6guu5prEMXhL3STv9F0bv0sdC_J7P0WgGJOSyWp6ZCgBipZFRziMiZjqgqAIuNK5avQjMf-75QXHQiLgRtoxpLPqub2IUQXAs7YTrL1es-IIzLHhRXyUGC8CzKrAKHENcwRiZUq95e6CuNImHM-6JIfquj443EHFFUk3MfDq8hCeTi7M-1_Uz2XiPIDaZvdmpE_MJkxhKPM&maxwidth=480	星期一: 10:30 – 20:30；星期二: 10:30 – 20:30；星期三: 10:30 – 20:30；星期四: 10:30 – 20:30；星期五: 10:30 – 20:30；星期六: 10:30 – 21:00；星期日: 10:30 – 21:00	096-352-1648	http://kokutei.co.jp/	https://maps.google.com/?cid=17450866251445301090	3.9	3431	\N	t	self_drive	\N	\N	\N
fallback_2_3	cmpzwpb2s002wpn84v336roey	2	熊本拉麵黑亭 熊本車站本店	安排停留 熊本拉麵黑亭 熊本車站本店。	14:30	熊本拉麵黑亭 熊本車站本店	32.7861456	130.6917365	2	activity	ai	熊本 建議停留點	2-chōme-1-23 Nihongi, Nishi Ward, Kumamoto, 860-0051日本	ChIJq6oOuPX0QDURYu8_pGXuLfI	/api/map/place-photo?ref=Ab43m-vCKOlFfbVm_72A6Biu-b2ldsIc04rLPpVQv1LdFNNa1hK9zJtrPVLHrBv_c5sbcselBeAcj9QLgALyFm2ZTptHgYuEp91tll5aE6aVdL4xL-SG1WyQWQ21CWDH9xHjRPdsPUV-tgMXRUbeuhPklqWH1C-57FwkoOaDBSf2ID7LByamTPBGTc6jSq1pIKYYLVO1dfgLj_b3bqU4QHB8Bw2PbVvC6DSOY0IL1zMLL3BAPmt0whPAJ6guu5prEMXhL3STv9F0bv0sdC_J7P0WgGJOSyWp6ZCgBipZFRziMiZjqgqAIuNK5avQjMf-75QXHQiLgRtoxpLPqub2IUQXAs7YTrL1es-IIzLHhRXyUGC8CzKrAKHENcwRiZUq95e6CuNImHM-6JIfquj443EHFFUk3MfDq8hCeTi7M-1_Uz2XiPIDaZvdmpE_MJkxhKPM&maxwidth=480	/api/map/place-photo?ref=Ab43m-vCKOlFfbVm_72A6Biu-b2ldsIc04rLPpVQv1LdFNNa1hK9zJtrPVLHrBv_c5sbcselBeAcj9QLgALyFm2ZTptHgYuEp91tll5aE6aVdL4xL-SG1WyQWQ21CWDH9xHjRPdsPUV-tgMXRUbeuhPklqWH1C-57FwkoOaDBSf2ID7LByamTPBGTc6jSq1pIKYYLVO1dfgLj_b3bqU4QHB8Bw2PbVvC6DSOY0IL1zMLL3BAPmt0whPAJ6guu5prEMXhL3STv9F0bv0sdC_J7P0WgGJOSyWp6ZCgBipZFRziMiZjqgqAIuNK5avQjMf-75QXHQiLgRtoxpLPqub2IUQXAs7YTrL1es-IIzLHhRXyUGC8CzKrAKHENcwRiZUq95e6CuNImHM-6JIfquj443EHFFUk3MfDq8hCeTi7M-1_Uz2XiPIDaZvdmpE_MJkxhKPM&maxwidth=480	星期一: 10:30 – 20:30；星期二: 10:30 – 20:30；星期三: 10:30 – 20:30；星期四: 10:30 – 20:30；星期五: 10:30 – 20:30；星期六: 10:30 – 21:00；星期日: 10:30 – 21:00	096-352-1648	http://kokutei.co.jp/	https://maps.google.com/?cid=17450866251445301090	3.9	3431	\N	t	self_drive	\N	\N	\N
fallback_2_meal_dinner	cmpzwpb2s002wpn84v336roey	2	flour + water熊本	安排在 flour + water熊本 用餐。	18:30	flour + water熊本	32.8027929	130.7100672	3	restaurant	ai	熊本 dinner	日本〒860-0808 Kumamoto, Chuo Ward, Tetorihonchō, 5−１ 1F	ChIJZ54wv_L1QDUR9ZyiUJwOYdI	/api/map/place-photo?ref=Ab43m-sY0RmTE2i2a3DHewfbwxT2abFXh5IhaaoGUs11jW1YukLI58f2KtIAzeFgfCmFZShwBeXqtob4rLXYB1knDiMDYtg5TK9n3EoMXrnfz-1QxU1-b3h__VF5gqjEzDp0vmmDdMomrNRWPpaq_AJ9fynZv-Am5LqfqXfZNnHSKNxbXdnY8MK8fV9bFK966hf5C__Mc_XigtB3Dm1cMOl0z_RIEfbNL_J-w-Kxbbz-ZzgzhVCWOrjjcnajDv5dxFQZLW-cALcNSVuJsC4NaSbnj_bgFZZe3pEIoqz0tvDhLOPaZNruNEiZaWp9UFYrS-viB7_8cIIDTmc2Kq6Zfd2Abfe3CtAcXr8dNG18xT7OF0Om0efwfziauA-KxunZXaOq2dBC3zmjD4k3rzelXD40GXqIfoBLlm6TgI2473d_4m8MU02C&maxwidth=480	/api/map/place-photo?ref=Ab43m-sY0RmTE2i2a3DHewfbwxT2abFXh5IhaaoGUs11jW1YukLI58f2KtIAzeFgfCmFZShwBeXqtob4rLXYB1knDiMDYtg5TK9n3EoMXrnfz-1QxU1-b3h__VF5gqjEzDp0vmmDdMomrNRWPpaq_AJ9fynZv-Am5LqfqXfZNnHSKNxbXdnY8MK8fV9bFK966hf5C__Mc_XigtB3Dm1cMOl0z_RIEfbNL_J-w-Kxbbz-ZzgzhVCWOrjjcnajDv5dxFQZLW-cALcNSVuJsC4NaSbnj_bgFZZe3pEIoqz0tvDhLOPaZNruNEiZaWp9UFYrS-viB7_8cIIDTmc2Kq6Zfd2Abfe3CtAcXr8dNG18xT7OF0Om0efwfziauA-KxunZXaOq2dBC3zmjD4k3rzelXD40GXqIfoBLlm6TgI2473d_4m8MU02C&maxwidth=480	星期一: 09:00 – 17:00；星期二: 09:00 – 17:00；星期三: 09:00 – 17:00；星期四: 09:00 – 17:00；星期五: 09:00 – 17:00；星期六: 09:00 – 17:00；星期日: 09:00 – 17:00	096-324-7730	https://www.instagram.com/flour_and_water_kumamoto/	https://maps.google.com/?cid=15159413885236321525	4.5	603	\N	t	self_drive	\N	\N	\N
fallback_3_1	cmpzwpb2s002wpn84v336roey	3	馬肉 SUGANOYA Ginza Street Store	安排停留 馬肉 SUGANOYA Ginza Street Store。	09:30	馬肉 SUGANOYA Ginza Street Store	32.8006975	130.7071243	0	attraction	ai	熊本 建議停留點	日本〒860-0807 Kumamoto, Chuo Ward, Shimotōri, 1-chōme−9−１ ダイワロイネットホテル 熊本銀座通り PREMIER ２F	ChIJ8QMSLA30QDURS58RWidtb9c	/api/map/place-photo?ref=Ab43m-tqqfofpDv8CK65o9WDO3kEZwyrLaXQ2KsfCGedwwMGNGu9-ZT2y9lOE30IFs77HozexS_QQjZya6p9xYdmWceVf2dhWEoRfRsd9wnl-Npdr6X6SBDm1CTsSD0gTrqzOLcW1XX48v8z1iHElvciY4P_izsyiIhHXXo0K_ebcRqjvD9ma2W6hIQrU4ZXuRF6nWc0h2rFWFBG-8bdtA4DZDl9sy3wnai_45kObMBbCZkUxBb9kz32Ca1USIta5oCZVzWWzFWePJ1ljvdp7swxHa1NO12USeB0zgtjX7UL2dn3JCHqqL5I2K0U5YUMxgNetNlqsKqtQgqoHjGjN_k31_QkBEk2GlG_Kec9_Z-cXEIBws3Jp6WrEMkfo-WGkCWofgcKDtlu2W6LZU0DPZbreOOS1wPFanb2QxbdFZl-jLcvyx7U0Ct-4s4q35Igjw&maxwidth=480	/api/map/place-photo?ref=Ab43m-tqqfofpDv8CK65o9WDO3kEZwyrLaXQ2KsfCGedwwMGNGu9-ZT2y9lOE30IFs77HozexS_QQjZya6p9xYdmWceVf2dhWEoRfRsd9wnl-Npdr6X6SBDm1CTsSD0gTrqzOLcW1XX48v8z1iHElvciY4P_izsyiIhHXXo0K_ebcRqjvD9ma2W6hIQrU4ZXuRF6nWc0h2rFWFBG-8bdtA4DZDl9sy3wnai_45kObMBbCZkUxBb9kz32Ca1USIta5oCZVzWWzFWePJ1ljvdp7swxHa1NO12USeB0zgtjX7UL2dn3JCHqqL5I2K0U5YUMxgNetNlqsKqtQgqoHjGjN_k31_QkBEk2GlG_Kec9_Z-cXEIBws3Jp6WrEMkfo-WGkCWofgcKDtlu2W6LZU0DPZbreOOS1wPFanb2QxbdFZl-jLcvyx7U0Ct-4s4q35Igjw&maxwidth=480	星期一: 11:30 – 14:30, 17:00 – 22:00；星期二: 11:30 – 14:30, 17:00 – 22:00；星期三: 11:30 – 14:30, 17:00 – 22:00；星期四: 11:30 – 14:30, 17:00 – 22:00；星期五: 11:30 – 14:30, 17:00 – 22:00；星期六: 11:30 – 14:30, 17:00 – 22:00；星期日: 11:30 – 14:30, 17:00 – 22:00	096-312-3618	http://service.suganoya.com/ginzadori/	https://maps.google.com/?cid=15523746456351645515	4.4	1070	\N	t	\N	\N	\N	\N
fallback_3_meal_lunch	cmpzwpb2s002wpn84v336roey	3	馬肉 SUGANOYA Ginza Street Store	安排在 馬肉 SUGANOYA Ginza Street Store 用餐。	12:30	馬肉 SUGANOYA Ginza Street Store	32.8006975	130.7071243	1	restaurant	ai	熊本 lunch	日本〒860-0807 Kumamoto, Chuo Ward, Shimotōri, 1-chōme−9−１ ダイワロイネットホテル 熊本銀座通り PREMIER ２F	ChIJ8QMSLA30QDURS58RWidtb9c	/api/map/place-photo?ref=Ab43m-tqqfofpDv8CK65o9WDO3kEZwyrLaXQ2KsfCGedwwMGNGu9-ZT2y9lOE30IFs77HozexS_QQjZya6p9xYdmWceVf2dhWEoRfRsd9wnl-Npdr6X6SBDm1CTsSD0gTrqzOLcW1XX48v8z1iHElvciY4P_izsyiIhHXXo0K_ebcRqjvD9ma2W6hIQrU4ZXuRF6nWc0h2rFWFBG-8bdtA4DZDl9sy3wnai_45kObMBbCZkUxBb9kz32Ca1USIta5oCZVzWWzFWePJ1ljvdp7swxHa1NO12USeB0zgtjX7UL2dn3JCHqqL5I2K0U5YUMxgNetNlqsKqtQgqoHjGjN_k31_QkBEk2GlG_Kec9_Z-cXEIBws3Jp6WrEMkfo-WGkCWofgcKDtlu2W6LZU0DPZbreOOS1wPFanb2QxbdFZl-jLcvyx7U0Ct-4s4q35Igjw&maxwidth=480	/api/map/place-photo?ref=Ab43m-tqqfofpDv8CK65o9WDO3kEZwyrLaXQ2KsfCGedwwMGNGu9-ZT2y9lOE30IFs77HozexS_QQjZya6p9xYdmWceVf2dhWEoRfRsd9wnl-Npdr6X6SBDm1CTsSD0gTrqzOLcW1XX48v8z1iHElvciY4P_izsyiIhHXXo0K_ebcRqjvD9ma2W6hIQrU4ZXuRF6nWc0h2rFWFBG-8bdtA4DZDl9sy3wnai_45kObMBbCZkUxBb9kz32Ca1USIta5oCZVzWWzFWePJ1ljvdp7swxHa1NO12USeB0zgtjX7UL2dn3JCHqqL5I2K0U5YUMxgNetNlqsKqtQgqoHjGjN_k31_QkBEk2GlG_Kec9_Z-cXEIBws3Jp6WrEMkfo-WGkCWofgcKDtlu2W6LZU0DPZbreOOS1wPFanb2QxbdFZl-jLcvyx7U0Ct-4s4q35Igjw&maxwidth=480	星期一: 11:30 – 14:30, 17:00 – 22:00；星期二: 11:30 – 14:30, 17:00 – 22:00；星期三: 11:30 – 14:30, 17:00 – 22:00；星期四: 11:30 – 14:30, 17:00 – 22:00；星期五: 11:30 – 14:30, 17:00 – 22:00；星期六: 11:30 – 14:30, 17:00 – 22:00；星期日: 11:30 – 14:30, 17:00 – 22:00	096-312-3618	http://service.suganoya.com/ginzadori/	https://maps.google.com/?cid=15523746456351645515	4.4	1070	\N	t	self_drive	\N	\N	\N
fallback_3_3	cmpzwpb2s002wpn84v336roey	3	flour + water熊本	安排停留 flour + water熊本。	14:30	flour + water熊本	32.8027929	130.7100672	2	activity	ai	熊本 建議停留點	日本〒860-0808 Kumamoto, Chuo Ward, Tetorihonchō, 5−１ 1F	ChIJZ54wv_L1QDUR9ZyiUJwOYdI	/api/map/place-photo?ref=Ab43m-sY0RmTE2i2a3DHewfbwxT2abFXh5IhaaoGUs11jW1YukLI58f2KtIAzeFgfCmFZShwBeXqtob4rLXYB1knDiMDYtg5TK9n3EoMXrnfz-1QxU1-b3h__VF5gqjEzDp0vmmDdMomrNRWPpaq_AJ9fynZv-Am5LqfqXfZNnHSKNxbXdnY8MK8fV9bFK966hf5C__Mc_XigtB3Dm1cMOl0z_RIEfbNL_J-w-Kxbbz-ZzgzhVCWOrjjcnajDv5dxFQZLW-cALcNSVuJsC4NaSbnj_bgFZZe3pEIoqz0tvDhLOPaZNruNEiZaWp9UFYrS-viB7_8cIIDTmc2Kq6Zfd2Abfe3CtAcXr8dNG18xT7OF0Om0efwfziauA-KxunZXaOq2dBC3zmjD4k3rzelXD40GXqIfoBLlm6TgI2473d_4m8MU02C&maxwidth=480	/api/map/place-photo?ref=Ab43m-sY0RmTE2i2a3DHewfbwxT2abFXh5IhaaoGUs11jW1YukLI58f2KtIAzeFgfCmFZShwBeXqtob4rLXYB1knDiMDYtg5TK9n3EoMXrnfz-1QxU1-b3h__VF5gqjEzDp0vmmDdMomrNRWPpaq_AJ9fynZv-Am5LqfqXfZNnHSKNxbXdnY8MK8fV9bFK966hf5C__Mc_XigtB3Dm1cMOl0z_RIEfbNL_J-w-Kxbbz-ZzgzhVCWOrjjcnajDv5dxFQZLW-cALcNSVuJsC4NaSbnj_bgFZZe3pEIoqz0tvDhLOPaZNruNEiZaWp9UFYrS-viB7_8cIIDTmc2Kq6Zfd2Abfe3CtAcXr8dNG18xT7OF0Om0efwfziauA-KxunZXaOq2dBC3zmjD4k3rzelXD40GXqIfoBLlm6TgI2473d_4m8MU02C&maxwidth=480	星期一: 09:00 – 17:00；星期二: 09:00 – 17:00；星期三: 09:00 – 17:00；星期四: 09:00 – 17:00；星期五: 09:00 – 17:00；星期六: 09:00 – 17:00；星期日: 09:00 – 17:00	096-324-7730	https://www.instagram.com/flour_and_water_kumamoto/	https://maps.google.com/?cid=15159413885236321525	4.5	603	\N	t	self_drive	\N	\N	\N
fallback_3_meal_dinner	cmpzwpb2s002wpn84v336roey	3	山見茶屋	安排在 山見茶屋 用餐。	18:30	山見茶屋	32.8037677	130.7040333	3	restaurant	ai	熊本 dinner	１-1-2 Ninomaru, Chuo Ward, Kumamoto, 860-0008日本	ChIJ__8D8RL0QDURQAKvKSHNCFw	/api/map/place-photo?ref=Ab43m-umAVs0gtQgJNNv6zpldlIDfOY3sExKyNMPHl2phRjDgoZHfZ4iStjRlo4AYTw1-ioo8oKTys64lt6HmFiZtTktY18y3X-6lWcSKWnSFUBVFnNpk4VHKfJ7QOk7-C8L4RItwswOH7Y10qbDuMm7uTLM-GCPY7i-zFmytj51r2VFRhqKf8FsylLBquUimlveSkb_g__qZDDBi6LRocSP_8w1eH4BoEJrp6QFtpImuUhxUXNqtDP97nVCXg0gS2_vWjiISwvf89Ricy6RLwTpfyJ58XF85_GZOwk6NlVeH4dP49__DO8NXDHDz3-uDSnISEE18TYo8thynqoQZDX7BLZS0LyTcufmDH86LzxsIZtHwqvz2L7VMDzxBzVRBmKV38h3sFt0VwMK_sjcSr9Q_hGm4qevB5CS_Waer4abHWHmNnLfSbjHIuN3liiNR3CI&maxwidth=480	/api/map/place-photo?ref=Ab43m-umAVs0gtQgJNNv6zpldlIDfOY3sExKyNMPHl2phRjDgoZHfZ4iStjRlo4AYTw1-ioo8oKTys64lt6HmFiZtTktY18y3X-6lWcSKWnSFUBVFnNpk4VHKfJ7QOk7-C8L4RItwswOH7Y10qbDuMm7uTLM-GCPY7i-zFmytj51r2VFRhqKf8FsylLBquUimlveSkb_g__qZDDBi6LRocSP_8w1eH4BoEJrp6QFtpImuUhxUXNqtDP97nVCXg0gS2_vWjiISwvf89Ricy6RLwTpfyJ58XF85_GZOwk6NlVeH4dP49__DO8NXDHDz3-uDSnISEE18TYo8thynqoQZDX7BLZS0LyTcufmDH86LzxsIZtHwqvz2L7VMDzxBzVRBmKV38h3sFt0VwMK_sjcSr9Q_hGm4qevB5CS_Waer4abHWHmNnLfSbjHIuN3liiNR3CI&maxwidth=480	星期一: 11:00 – 17:20；星期二: 11:00 – 17:20；星期三: 11:00 – 17:20；星期四: 11:00 – 17:20；星期五: 11:00 – 17:20；星期六: 11:00 – 17:20；星期日: 11:00 – 17:20	096-327-9293	http://yamami-cyaya.com/	https://maps.google.com/?cid=6631775993620005440	4.3	440	\N	t	self_drive	\N	\N	\N
fallback_4_1	cmpzwpb2s002wpn84v336roey	4	山見茶屋	安排停留 山見茶屋。	09:30	山見茶屋	32.8037677	130.7040333	0	attraction	ai	熊本 建議停留點	１-1-2 Ninomaru, Chuo Ward, Kumamoto, 860-0008日本	ChIJ__8D8RL0QDURQAKvKSHNCFw	/api/map/place-photo?ref=Ab43m-umAVs0gtQgJNNv6zpldlIDfOY3sExKyNMPHl2phRjDgoZHfZ4iStjRlo4AYTw1-ioo8oKTys64lt6HmFiZtTktY18y3X-6lWcSKWnSFUBVFnNpk4VHKfJ7QOk7-C8L4RItwswOH7Y10qbDuMm7uTLM-GCPY7i-zFmytj51r2VFRhqKf8FsylLBquUimlveSkb_g__qZDDBi6LRocSP_8w1eH4BoEJrp6QFtpImuUhxUXNqtDP97nVCXg0gS2_vWjiISwvf89Ricy6RLwTpfyJ58XF85_GZOwk6NlVeH4dP49__DO8NXDHDz3-uDSnISEE18TYo8thynqoQZDX7BLZS0LyTcufmDH86LzxsIZtHwqvz2L7VMDzxBzVRBmKV38h3sFt0VwMK_sjcSr9Q_hGm4qevB5CS_Waer4abHWHmNnLfSbjHIuN3liiNR3CI&maxwidth=480	/api/map/place-photo?ref=Ab43m-umAVs0gtQgJNNv6zpldlIDfOY3sExKyNMPHl2phRjDgoZHfZ4iStjRlo4AYTw1-ioo8oKTys64lt6HmFiZtTktY18y3X-6lWcSKWnSFUBVFnNpk4VHKfJ7QOk7-C8L4RItwswOH7Y10qbDuMm7uTLM-GCPY7i-zFmytj51r2VFRhqKf8FsylLBquUimlveSkb_g__qZDDBi6LRocSP_8w1eH4BoEJrp6QFtpImuUhxUXNqtDP97nVCXg0gS2_vWjiISwvf89Ricy6RLwTpfyJ58XF85_GZOwk6NlVeH4dP49__DO8NXDHDz3-uDSnISEE18TYo8thynqoQZDX7BLZS0LyTcufmDH86LzxsIZtHwqvz2L7VMDzxBzVRBmKV38h3sFt0VwMK_sjcSr9Q_hGm4qevB5CS_Waer4abHWHmNnLfSbjHIuN3liiNR3CI&maxwidth=480	星期一: 11:00 – 17:20；星期二: 11:00 – 17:20；星期三: 11:00 – 17:20；星期四: 11:00 – 17:20；星期五: 11:00 – 17:20；星期六: 11:00 – 17:20；星期日: 11:00 – 17:20	096-327-9293	http://yamami-cyaya.com/	https://maps.google.com/?cid=6631775993620005440	4.3	440	\N	t	\N	\N	\N	\N
fallback_4_meal_lunch	cmpzwpb2s002wpn84v336roey	4	flour + water熊本	安排在 flour + water熊本 用餐。	12:30	flour + water熊本	32.8027929	130.7100672	1	restaurant	ai	熊本 lunch	日本〒860-0808 Kumamoto, Chuo Ward, Tetorihonchō, 5−１ 1F	ChIJZ54wv_L1QDUR9ZyiUJwOYdI	/api/map/place-photo?ref=Ab43m-sY0RmTE2i2a3DHewfbwxT2abFXh5IhaaoGUs11jW1YukLI58f2KtIAzeFgfCmFZShwBeXqtob4rLXYB1knDiMDYtg5TK9n3EoMXrnfz-1QxU1-b3h__VF5gqjEzDp0vmmDdMomrNRWPpaq_AJ9fynZv-Am5LqfqXfZNnHSKNxbXdnY8MK8fV9bFK966hf5C__Mc_XigtB3Dm1cMOl0z_RIEfbNL_J-w-Kxbbz-ZzgzhVCWOrjjcnajDv5dxFQZLW-cALcNSVuJsC4NaSbnj_bgFZZe3pEIoqz0tvDhLOPaZNruNEiZaWp9UFYrS-viB7_8cIIDTmc2Kq6Zfd2Abfe3CtAcXr8dNG18xT7OF0Om0efwfziauA-KxunZXaOq2dBC3zmjD4k3rzelXD40GXqIfoBLlm6TgI2473d_4m8MU02C&maxwidth=480	/api/map/place-photo?ref=Ab43m-sY0RmTE2i2a3DHewfbwxT2abFXh5IhaaoGUs11jW1YukLI58f2KtIAzeFgfCmFZShwBeXqtob4rLXYB1knDiMDYtg5TK9n3EoMXrnfz-1QxU1-b3h__VF5gqjEzDp0vmmDdMomrNRWPpaq_AJ9fynZv-Am5LqfqXfZNnHSKNxbXdnY8MK8fV9bFK966hf5C__Mc_XigtB3Dm1cMOl0z_RIEfbNL_J-w-Kxbbz-ZzgzhVCWOrjjcnajDv5dxFQZLW-cALcNSVuJsC4NaSbnj_bgFZZe3pEIoqz0tvDhLOPaZNruNEiZaWp9UFYrS-viB7_8cIIDTmc2Kq6Zfd2Abfe3CtAcXr8dNG18xT7OF0Om0efwfziauA-KxunZXaOq2dBC3zmjD4k3rzelXD40GXqIfoBLlm6TgI2473d_4m8MU02C&maxwidth=480	星期一: 09:00 – 17:00；星期二: 09:00 – 17:00；星期三: 09:00 – 17:00；星期四: 09:00 – 17:00；星期五: 09:00 – 17:00；星期六: 09:00 – 17:00；星期日: 09:00 – 17:00	096-324-7730	https://www.instagram.com/flour_and_water_kumamoto/	https://maps.google.com/?cid=15159413885236321525	4.5	603	\N	t	self_drive	\N	\N	\N
fallback_4_3	cmpzwpb2s002wpn84v336roey	4	Minoru Shokudo AMU Plaza Kumamoto	安排停留 Minoru Shokudo AMU Plaza Kumamoto。	14:30	Minoru Shokudo AMU Plaza Kumamoto	32.7884654	130.6884596	2	activity	ai	熊本 建議停留點	日本〒860-0047 Kumamoto, Nishi Ward, Kasuga, 3-chōme−15−15番26号 アミュプラザくまもと 6F	ChIJFU2GlXf1QDURRVoAkKJW-iE	/api/map/place-photo?ref=Ab43m-s-1eSCKIys-0ESBGJqp0fvmUblUeici_RP9H3p6pOLVlR-8VbcFoGo7sytafamUHdyBqrKO6m4y2CVnfv4We87_1X9Y2NK2bqmWkCuke0ZVgLxXetxQaVkX5GCCICGamwcRXNegR74XpFmi0B9kWmlshbRcLjs2kDrZ0Arqp_Bn_frG55_dJaWRki233-NYHDb0ycwjGdR6KndnVDltXxLgv_eib6yQm1lo86qD8PPzEIMse1sI-upZp9qRVkQ-4zC16ZYNTP2bh5tFG89cuxqFstz3GJSWGX_sTxvmrEt0jbm6qAR2a5NsewiqwmpkXoA_X9vwCO8hp1m9mftZ7lfyGatmLBTWmcQdz4zYpIYAfeG7EfBLL7zBFgTuNugHdOjUEorotb3R9fj8rF9G6Ld2avJeYVEbvUm0-6oLL_NJxls&maxwidth=480	/api/map/place-photo?ref=Ab43m-s-1eSCKIys-0ESBGJqp0fvmUblUeici_RP9H3p6pOLVlR-8VbcFoGo7sytafamUHdyBqrKO6m4y2CVnfv4We87_1X9Y2NK2bqmWkCuke0ZVgLxXetxQaVkX5GCCICGamwcRXNegR74XpFmi0B9kWmlshbRcLjs2kDrZ0Arqp_Bn_frG55_dJaWRki233-NYHDb0ycwjGdR6KndnVDltXxLgv_eib6yQm1lo86qD8PPzEIMse1sI-upZp9qRVkQ-4zC16ZYNTP2bh5tFG89cuxqFstz3GJSWGX_sTxvmrEt0jbm6qAR2a5NsewiqwmpkXoA_X9vwCO8hp1m9mftZ7lfyGatmLBTWmcQdz4zYpIYAfeG7EfBLL7zBFgTuNugHdOjUEorotb3R9fj8rF9G6Ld2avJeYVEbvUm0-6oLL_NJxls&maxwidth=480	星期一: 11:00 – 22:00；星期二: 11:00 – 22:00；星期三: 11:00 – 22:00；星期四: 11:00 – 22:00；星期五: 11:00 – 22:00；星期六: 11:00 – 22:00；星期日: 11:00 – 22:00	096-288-0154	https://www.minoriminoru.jp/	https://maps.google.com/?cid=2448364603629918789	4	248	\N	t	self_drive	\N	\N	\N
fallback_4_meal_dinner	cmpzwpb2s002wpn84v336roey	4	Minoru Shokudo AMU Plaza Kumamoto	安排在 Minoru Shokudo AMU Plaza Kumamoto 用餐。	18:30	Minoru Shokudo AMU Plaza Kumamoto	32.7884654	130.6884596	3	restaurant	ai	熊本 dinner	日本〒860-0047 Kumamoto, Nishi Ward, Kasuga, 3-chōme−15−15番26号 アミュプラザくまもと 6F	ChIJFU2GlXf1QDURRVoAkKJW-iE	/api/map/place-photo?ref=Ab43m-s-1eSCKIys-0ESBGJqp0fvmUblUeici_RP9H3p6pOLVlR-8VbcFoGo7sytafamUHdyBqrKO6m4y2CVnfv4We87_1X9Y2NK2bqmWkCuke0ZVgLxXetxQaVkX5GCCICGamwcRXNegR74XpFmi0B9kWmlshbRcLjs2kDrZ0Arqp_Bn_frG55_dJaWRki233-NYHDb0ycwjGdR6KndnVDltXxLgv_eib6yQm1lo86qD8PPzEIMse1sI-upZp9qRVkQ-4zC16ZYNTP2bh5tFG89cuxqFstz3GJSWGX_sTxvmrEt0jbm6qAR2a5NsewiqwmpkXoA_X9vwCO8hp1m9mftZ7lfyGatmLBTWmcQdz4zYpIYAfeG7EfBLL7zBFgTuNugHdOjUEorotb3R9fj8rF9G6Ld2avJeYVEbvUm0-6oLL_NJxls&maxwidth=480	/api/map/place-photo?ref=Ab43m-s-1eSCKIys-0ESBGJqp0fvmUblUeici_RP9H3p6pOLVlR-8VbcFoGo7sytafamUHdyBqrKO6m4y2CVnfv4We87_1X9Y2NK2bqmWkCuke0ZVgLxXetxQaVkX5GCCICGamwcRXNegR74XpFmi0B9kWmlshbRcLjs2kDrZ0Arqp_Bn_frG55_dJaWRki233-NYHDb0ycwjGdR6KndnVDltXxLgv_eib6yQm1lo86qD8PPzEIMse1sI-upZp9qRVkQ-4zC16ZYNTP2bh5tFG89cuxqFstz3GJSWGX_sTxvmrEt0jbm6qAR2a5NsewiqwmpkXoA_X9vwCO8hp1m9mftZ7lfyGatmLBTWmcQdz4zYpIYAfeG7EfBLL7zBFgTuNugHdOjUEorotb3R9fj8rF9G6Ld2avJeYVEbvUm0-6oLL_NJxls&maxwidth=480	星期一: 11:00 – 22:00；星期二: 11:00 – 22:00；星期三: 11:00 – 22:00；星期四: 11:00 – 22:00；星期五: 11:00 – 22:00；星期六: 11:00 – 22:00；星期日: 11:00 – 22:00	096-288-0154	https://www.minoriminoru.jp/	https://maps.google.com/?cid=2448364603629918789	4	248	\N	t	self_drive	\N	\N	\N
fallback_5_1	cmpzwpb2s002wpn84v336roey	5	FUJIWARA STEAK HOUSE / 熊本 / 餐廳 / 鐵板燒 / 和牛 / 牛排	安排停留 FUJIWARA STEAK HOUSE / 熊本 / 餐廳 / 鐵板燒 / 和牛 / 牛排。	09:30	FUJIWARA STEAK HOUSE / 熊本 / 餐廳 / 鐵板燒 / 和牛 / 牛排	32.8014969	130.7101962	0	attraction	ai	熊本 建議停留點	日本〒860-0801 Kumamoto, Chuo Ward, Anseimachi, 6−２ ダイバシティ3F	ChIJ73VHnb71QDURZ4EbjE2uxFo	/api/map/place-photo?ref=Ab43m-s8BXYG7v70V6_WkL9-96K5YZg-ksWRhzceDG34PFSBVtFieXCjmvOUBSw3MbY1dnjXXamHVflJofmX2D--qKH4ed7TTKywGB90eAz9cKbn4cmZABND-ssBKBAUlqtSEyscmde8E3l9FzjfBbqQ2qagL64XnBz7Uqu7Op0sVXClfl2pA1rYlpd8g4DCGXXK9BKVB5OKs_llbiWGN0wDc3VJLTTYth13uWppLbdWLk1N_gA2WY1ASDFshOQUl7U9aF_1pypI1JvLB7rDHGrElFMOCner1ROYQgpyTtXmPjwlJse4qMiKNzPN9b47b_nMPni1fEQdF9SlOt35D23UpwMg_oVPVUgPwUEgGIednNWrlgjDoqoAKwI8IwIkFEXnFTOjGjnWpNGLnNaBZjlh3qF6It8q7oAKKMMFH1shUCg&maxwidth=480	/api/map/place-photo?ref=Ab43m-s8BXYG7v70V6_WkL9-96K5YZg-ksWRhzceDG34PFSBVtFieXCjmvOUBSw3MbY1dnjXXamHVflJofmX2D--qKH4ed7TTKywGB90eAz9cKbn4cmZABND-ssBKBAUlqtSEyscmde8E3l9FzjfBbqQ2qagL64XnBz7Uqu7Op0sVXClfl2pA1rYlpd8g4DCGXXK9BKVB5OKs_llbiWGN0wDc3VJLTTYth13uWppLbdWLk1N_gA2WY1ASDFshOQUl7U9aF_1pypI1JvLB7rDHGrElFMOCner1ROYQgpyTtXmPjwlJse4qMiKNzPN9b47b_nMPni1fEQdF9SlOt35D23UpwMg_oVPVUgPwUEgGIednNWrlgjDoqoAKwI8IwIkFEXnFTOjGjnWpNGLnNaBZjlh3qF6It8q7oAKKMMFH1shUCg&maxwidth=480	星期一: 17:00 – 22:00；星期二: 17:00 – 22:00；星期三: 17:00 – 22:00；星期四: 17:00 – 22:00；星期五: 17:00 – 22:00；星期六: 17:00 – 22:00；星期日: 17:00 – 22:00	096-355-8778	https://hitosara.com/0020007433/	https://maps.google.com/?cid=6540544206935130471	4.7	35	\N	t	\N	\N	\N	\N
fallback_5_meal_lunch	cmpzwpb2s002wpn84v336roey	5	山見茶屋	安排在 山見茶屋 用餐。	12:30	山見茶屋	32.8037677	130.7040333	1	restaurant	ai	熊本 lunch	１-1-2 Ninomaru, Chuo Ward, Kumamoto, 860-0008日本	ChIJ__8D8RL0QDURQAKvKSHNCFw	/api/map/place-photo?ref=Ab43m-umAVs0gtQgJNNv6zpldlIDfOY3sExKyNMPHl2phRjDgoZHfZ4iStjRlo4AYTw1-ioo8oKTys64lt6HmFiZtTktY18y3X-6lWcSKWnSFUBVFnNpk4VHKfJ7QOk7-C8L4RItwswOH7Y10qbDuMm7uTLM-GCPY7i-zFmytj51r2VFRhqKf8FsylLBquUimlveSkb_g__qZDDBi6LRocSP_8w1eH4BoEJrp6QFtpImuUhxUXNqtDP97nVCXg0gS2_vWjiISwvf89Ricy6RLwTpfyJ58XF85_GZOwk6NlVeH4dP49__DO8NXDHDz3-uDSnISEE18TYo8thynqoQZDX7BLZS0LyTcufmDH86LzxsIZtHwqvz2L7VMDzxBzVRBmKV38h3sFt0VwMK_sjcSr9Q_hGm4qevB5CS_Waer4abHWHmNnLfSbjHIuN3liiNR3CI&maxwidth=480	/api/map/place-photo?ref=Ab43m-umAVs0gtQgJNNv6zpldlIDfOY3sExKyNMPHl2phRjDgoZHfZ4iStjRlo4AYTw1-ioo8oKTys64lt6HmFiZtTktY18y3X-6lWcSKWnSFUBVFnNpk4VHKfJ7QOk7-C8L4RItwswOH7Y10qbDuMm7uTLM-GCPY7i-zFmytj51r2VFRhqKf8FsylLBquUimlveSkb_g__qZDDBi6LRocSP_8w1eH4BoEJrp6QFtpImuUhxUXNqtDP97nVCXg0gS2_vWjiISwvf89Ricy6RLwTpfyJ58XF85_GZOwk6NlVeH4dP49__DO8NXDHDz3-uDSnISEE18TYo8thynqoQZDX7BLZS0LyTcufmDH86LzxsIZtHwqvz2L7VMDzxBzVRBmKV38h3sFt0VwMK_sjcSr9Q_hGm4qevB5CS_Waer4abHWHmNnLfSbjHIuN3liiNR3CI&maxwidth=480	星期一: 11:00 – 17:20；星期二: 11:00 – 17:20；星期三: 11:00 – 17:20；星期四: 11:00 – 17:20；星期五: 11:00 – 17:20；星期六: 11:00 – 17:20；星期日: 11:00 – 17:20	096-327-9293	http://yamami-cyaya.com/	https://maps.google.com/?cid=6631775993620005440	4.3	440	\N	t	self_drive	\N	\N	\N
fallback_5_3	cmpzwpb2s002wpn84v336roey	5	Food Pal熊本	安排停留 Food Pal熊本。	14:30	Food Pal熊本	32.8483197	130.6959799	2	activity	ai	熊本 建議停留點	581-2 Mitsugumachi, Kita Ward, Kumamoto, 861-5535日本	ChIJ3Y0aDML2QDURIlLy9B1PO4g	/api/map/place-photo?ref=Ab43m-sgaHcHiJtcCqjYQnIfjSAqWMqIIYBgQQrxx0BMfpDv_hKEdla3Is2DBD-PG95iT9mza7Uuu5gO03vkQ4I3M_1-3F51mE8vGbMPM2l7oxem0axzHg4HKLvYmXVpazZ-SC9oS8gn8mqXuvrzoTSymVJyhzCycXwkM-WBhAZH0yUgZRp7mBaCE64knohHA8r-NKHSQV-cOxVMheT0h-RLtgLI_UCKA0tXeX5vwnKCPp3gNqMh4Lxgb9y_IAxGgzhAlFVs5P52-wh5RtmlP_rBmM8VGRHn58_O0HLHdJ7g-dIxoAetyte_CxFvHeyIQQ0gMj9No2Ke2nYKvnDtFNo4JRMymutfE0aGmzQavcT6a4Yuw1dk3BIx4gqoFF64SfP1MXyci8zbUmgmFrQDTJhewlbJfC99Y7ZNy8zUFnOLv9k&maxwidth=480	/api/map/place-photo?ref=Ab43m-sgaHcHiJtcCqjYQnIfjSAqWMqIIYBgQQrxx0BMfpDv_hKEdla3Is2DBD-PG95iT9mza7Uuu5gO03vkQ4I3M_1-3F51mE8vGbMPM2l7oxem0axzHg4HKLvYmXVpazZ-SC9oS8gn8mqXuvrzoTSymVJyhzCycXwkM-WBhAZH0yUgZRp7mBaCE64knohHA8r-NKHSQV-cOxVMheT0h-RLtgLI_UCKA0tXeX5vwnKCPp3gNqMh4Lxgb9y_IAxGgzhAlFVs5P52-wh5RtmlP_rBmM8VGRHn58_O0HLHdJ7g-dIxoAetyte_CxFvHeyIQQ0gMj9No2Ke2nYKvnDtFNo4JRMymutfE0aGmzQavcT6a4Yuw1dk3BIx4gqoFF64SfP1MXyci8zbUmgmFrQDTJhewlbJfC99Y7ZNy8zUFnOLv9k&maxwidth=480	星期一: 09:00 – 17:00；星期二: 09:00 – 17:00；星期三: 09:00 – 17:00；星期四: 09:00 – 17:00；星期五: 09:00 – 17:00；星期六: 09:00 – 17:00；星期日: 09:00 – 17:00	096-245-5630	http://www.foodpal-kumamoto.jp/	https://maps.google.com/?cid=9816526802866295330	3.4	497	\N	t	self_drive	\N	\N	\N
fallback_5_meal_dinner	cmpzwpb2s002wpn84v336roey	5	FUJIWARA STEAK HOUSE / 熊本 / 餐廳 / 鐵板燒 / 和牛 / 牛排	安排在 FUJIWARA STEAK HOUSE / 熊本 / 餐廳 / 鐵板燒 / 和牛 / 牛排 用餐。	18:30	FUJIWARA STEAK HOUSE / 熊本 / 餐廳 / 鐵板燒 / 和牛 / 牛排	32.8014969	130.7101962	3	restaurant	ai	熊本 dinner	日本〒860-0801 Kumamoto, Chuo Ward, Anseimachi, 6−２ ダイバシティ3F	ChIJ73VHnb71QDURZ4EbjE2uxFo	/api/map/place-photo?ref=Ab43m-s8BXYG7v70V6_WkL9-96K5YZg-ksWRhzceDG34PFSBVtFieXCjmvOUBSw3MbY1dnjXXamHVflJofmX2D--qKH4ed7TTKywGB90eAz9cKbn4cmZABND-ssBKBAUlqtSEyscmde8E3l9FzjfBbqQ2qagL64XnBz7Uqu7Op0sVXClfl2pA1rYlpd8g4DCGXXK9BKVB5OKs_llbiWGN0wDc3VJLTTYth13uWppLbdWLk1N_gA2WY1ASDFshOQUl7U9aF_1pypI1JvLB7rDHGrElFMOCner1ROYQgpyTtXmPjwlJse4qMiKNzPN9b47b_nMPni1fEQdF9SlOt35D23UpwMg_oVPVUgPwUEgGIednNWrlgjDoqoAKwI8IwIkFEXnFTOjGjnWpNGLnNaBZjlh3qF6It8q7oAKKMMFH1shUCg&maxwidth=480	/api/map/place-photo?ref=Ab43m-s8BXYG7v70V6_WkL9-96K5YZg-ksWRhzceDG34PFSBVtFieXCjmvOUBSw3MbY1dnjXXamHVflJofmX2D--qKH4ed7TTKywGB90eAz9cKbn4cmZABND-ssBKBAUlqtSEyscmde8E3l9FzjfBbqQ2qagL64XnBz7Uqu7Op0sVXClfl2pA1rYlpd8g4DCGXXK9BKVB5OKs_llbiWGN0wDc3VJLTTYth13uWppLbdWLk1N_gA2WY1ASDFshOQUl7U9aF_1pypI1JvLB7rDHGrElFMOCner1ROYQgpyTtXmPjwlJse4qMiKNzPN9b47b_nMPni1fEQdF9SlOt35D23UpwMg_oVPVUgPwUEgGIednNWrlgjDoqoAKwI8IwIkFEXnFTOjGjnWpNGLnNaBZjlh3qF6It8q7oAKKMMFH1shUCg&maxwidth=480	星期一: 17:00 – 22:00；星期二: 17:00 – 22:00；星期三: 17:00 – 22:00；星期四: 17:00 – 22:00；星期五: 17:00 – 22:00；星期六: 17:00 – 22:00；星期日: 17:00 – 22:00	096-355-8778	https://hitosara.com/0020007433/	https://maps.google.com/?cid=6540544206935130471	4.7	35	\N	t	self_drive	\N	\N	\N
fallback_6_1	cmpzwpb2s002wpn84v336roey	6	勝烈亭 新市街本店	安排停留 勝烈亭 新市街本店。	09:30	勝烈亭 新市街本店	32.798616	130.705876	0	attraction	ai	熊本 建議停留點	8-18 Shinshigai, Chuo Ward, Kumamoto, 860-0803日本	ChIJq6pWfnL0QDURDLSaMP-qb3k	/api/map/place-photo?ref=Ab43m-sm5VQIFtbpYn_nO0QySqc-ViOsM0BME-s-sSsbfnx061e3rkpefQNiTUwan3YZu-U_Ry4m-E4TOlcUVnFstH9DOl815tGtAPN4OjVwHn9i7-Td4CSEQReJ-FIXGqi81pC3aDEdu2OricHklfik5DYV6dxpXikOZBIF2VRLvMBXYCQGQiwZW4Dtq_d99wsnRvxBpuyXJyHKAOQnb0HZoLrCfOFtgeN_4iBSASgrQQ5H8Z9G5KG_IKyaitIpwC-a9KMf896zIVcrLlZQ3s2mrHsjAjsS468rZiyOtLwaOTK42ZyaNVg5qRYIICr1nCKEP_YfbMDCHNu503g8qCpLkMMyUY04sKJZxYQ6Ha-lAj5TUGwOL6qPVhHqzeaozHSTQXZSRtL-5rL6eqTnRKd_9o3IS6VLLfThd_0tdlUOgRJkGKwc3C-SvdoWwZmA7Wz-&maxwidth=480	/api/map/place-photo?ref=Ab43m-sm5VQIFtbpYn_nO0QySqc-ViOsM0BME-s-sSsbfnx061e3rkpefQNiTUwan3YZu-U_Ry4m-E4TOlcUVnFstH9DOl815tGtAPN4OjVwHn9i7-Td4CSEQReJ-FIXGqi81pC3aDEdu2OricHklfik5DYV6dxpXikOZBIF2VRLvMBXYCQGQiwZW4Dtq_d99wsnRvxBpuyXJyHKAOQnb0HZoLrCfOFtgeN_4iBSASgrQQ5H8Z9G5KG_IKyaitIpwC-a9KMf896zIVcrLlZQ3s2mrHsjAjsS468rZiyOtLwaOTK42ZyaNVg5qRYIICr1nCKEP_YfbMDCHNu503g8qCpLkMMyUY04sKJZxYQ6Ha-lAj5TUGwOL6qPVhHqzeaozHSTQXZSRtL-5rL6eqTnRKd_9o3IS6VLLfThd_0tdlUOgRJkGKwc3C-SvdoWwZmA7Wz-&maxwidth=480	星期一: 11:00 – 21:30；星期二: 11:00 – 21:30；星期三: 11:00 – 21:30；星期四: 11:00 – 21:30；星期五: 11:00 – 21:30；星期六: 11:00 – 21:30；星期日: 11:00 – 21:30	096-322-8771	https://hayashi-sangyo.jp/	https://maps.google.com/?cid=8750400614012990476	4.5	6102	\N	t	\N	\N	\N	\N
fallback_6_meal_lunch	cmpzwpb2s002wpn84v336roey	6	Minoru Shokudo AMU Plaza Kumamoto	安排在 Minoru Shokudo AMU Plaza Kumamoto 用餐。	12:30	Minoru Shokudo AMU Plaza Kumamoto	32.7884654	130.6884596	1	restaurant	ai	熊本 lunch	日本〒860-0047 Kumamoto, Nishi Ward, Kasuga, 3-chōme−15−15番26号 アミュプラザくまもと 6F	ChIJFU2GlXf1QDURRVoAkKJW-iE	/api/map/place-photo?ref=Ab43m-s-1eSCKIys-0ESBGJqp0fvmUblUeici_RP9H3p6pOLVlR-8VbcFoGo7sytafamUHdyBqrKO6m4y2CVnfv4We87_1X9Y2NK2bqmWkCuke0ZVgLxXetxQaVkX5GCCICGamwcRXNegR74XpFmi0B9kWmlshbRcLjs2kDrZ0Arqp_Bn_frG55_dJaWRki233-NYHDb0ycwjGdR6KndnVDltXxLgv_eib6yQm1lo86qD8PPzEIMse1sI-upZp9qRVkQ-4zC16ZYNTP2bh5tFG89cuxqFstz3GJSWGX_sTxvmrEt0jbm6qAR2a5NsewiqwmpkXoA_X9vwCO8hp1m9mftZ7lfyGatmLBTWmcQdz4zYpIYAfeG7EfBLL7zBFgTuNugHdOjUEorotb3R9fj8rF9G6Ld2avJeYVEbvUm0-6oLL_NJxls&maxwidth=480	/api/map/place-photo?ref=Ab43m-s-1eSCKIys-0ESBGJqp0fvmUblUeici_RP9H3p6pOLVlR-8VbcFoGo7sytafamUHdyBqrKO6m4y2CVnfv4We87_1X9Y2NK2bqmWkCuke0ZVgLxXetxQaVkX5GCCICGamwcRXNegR74XpFmi0B9kWmlshbRcLjs2kDrZ0Arqp_Bn_frG55_dJaWRki233-NYHDb0ycwjGdR6KndnVDltXxLgv_eib6yQm1lo86qD8PPzEIMse1sI-upZp9qRVkQ-4zC16ZYNTP2bh5tFG89cuxqFstz3GJSWGX_sTxvmrEt0jbm6qAR2a5NsewiqwmpkXoA_X9vwCO8hp1m9mftZ7lfyGatmLBTWmcQdz4zYpIYAfeG7EfBLL7zBFgTuNugHdOjUEorotb3R9fj8rF9G6Ld2avJeYVEbvUm0-6oLL_NJxls&maxwidth=480	星期一: 11:00 – 22:00；星期二: 11:00 – 22:00；星期三: 11:00 – 22:00；星期四: 11:00 – 22:00；星期五: 11:00 – 22:00；星期六: 11:00 – 22:00；星期日: 11:00 – 22:00	096-288-0154	https://www.minoriminoru.jp/	https://maps.google.com/?cid=2448364603629918789	4	248	\N	t	self_drive	\N	\N	\N
fallback_6_3	cmpzwpb2s002wpn84v336roey	6	熊本屋台村	安排停留 熊本屋台村。	14:30	熊本屋台村	32.8039537	130.709502	2	activity	ai	熊本 建議停留點	2-22 Jōtōmachi, Chuo Ward, Kumamoto, 860-0846日本	ChIJiwXzCvj1QDUREDoJqSaSBPQ	/api/map/place-photo?ref=Ab43m-sWSIqfH_F7q-lq82T2k3CDb5_raERyMwRzysxjG_C22yWyNLYP-Lsyg8LPxIidGWWkezePa5s6s1F0CPu1nudFAoCtBi7WmVzEvEwjTgDdzKGaY1RGJCacnslq2uh5V9d6HI12o5bxJgslvDbsM4aiX3csOTZ9HHUz5m-Zjo67n79Liw9gSDOro7qkN4OOWszydEj5NibF6FrLOT_cxDRsVkWBhd2F5vbIimOPQsLSwbw0bUtCMBDnkd-VBK4KAR2gcPvD_XYNXBzPczPUpLRaSPl9yGhj3K2Mrl65PuMWrFduExf9Oh1doZklddftqKMgwmqCj-Ah5HyvAwrlMTqpgpUkJvtBckSo7mwRdq2d2YNESZJtMESvBblrY4GXx_nWAkn6XDmOeGiWYQ0EFcEMjq1PuTykXk--Jy4j_yDK1A&maxwidth=480	/api/map/place-photo?ref=Ab43m-sWSIqfH_F7q-lq82T2k3CDb5_raERyMwRzysxjG_C22yWyNLYP-Lsyg8LPxIidGWWkezePa5s6s1F0CPu1nudFAoCtBi7WmVzEvEwjTgDdzKGaY1RGJCacnslq2uh5V9d6HI12o5bxJgslvDbsM4aiX3csOTZ9HHUz5m-Zjo67n79Liw9gSDOro7qkN4OOWszydEj5NibF6FrLOT_cxDRsVkWBhd2F5vbIimOPQsLSwbw0bUtCMBDnkd-VBK4KAR2gcPvD_XYNXBzPczPUpLRaSPl9yGhj3K2Mrl65PuMWrFduExf9Oh1doZklddftqKMgwmqCj-Ah5HyvAwrlMTqpgpUkJvtBckSo7mwRdq2d2YNESZJtMESvBblrY4GXx_nWAkn6XDmOeGiWYQ0EFcEMjq1PuTykXk--Jy4j_yDK1A&maxwidth=480	星期一: 15:00 – 23:30；星期二: 15:00 – 23:30；星期三: 休息；星期四: 15:00 – 23:30；星期五: 15:00 – 23:30；星期六: 12:00 – 23:30；星期日: 12:00 – 23:30	\N	https://kumamotoyataimura.com/?utm_source=google&utm_medium=google_map&utm_campaign=tech_04	https://maps.google.com/?cid=17583339539903625744	3.9	687	\N	t	self_drive	\N	\N	\N
fallback_6_meal_dinner	cmpzwpb2s002wpn84v336roey	6	Food Pal熊本	安排在 Food Pal熊本 用餐。	18:30	Food Pal熊本	32.8483197	130.6959799	3	restaurant	ai	熊本 dinner	581-2 Mitsugumachi, Kita Ward, Kumamoto, 861-5535日本	ChIJ3Y0aDML2QDURIlLy9B1PO4g	/api/map/place-photo?ref=Ab43m-sgaHcHiJtcCqjYQnIfjSAqWMqIIYBgQQrxx0BMfpDv_hKEdla3Is2DBD-PG95iT9mza7Uuu5gO03vkQ4I3M_1-3F51mE8vGbMPM2l7oxem0axzHg4HKLvYmXVpazZ-SC9oS8gn8mqXuvrzoTSymVJyhzCycXwkM-WBhAZH0yUgZRp7mBaCE64knohHA8r-NKHSQV-cOxVMheT0h-RLtgLI_UCKA0tXeX5vwnKCPp3gNqMh4Lxgb9y_IAxGgzhAlFVs5P52-wh5RtmlP_rBmM8VGRHn58_O0HLHdJ7g-dIxoAetyte_CxFvHeyIQQ0gMj9No2Ke2nYKvnDtFNo4JRMymutfE0aGmzQavcT6a4Yuw1dk3BIx4gqoFF64SfP1MXyci8zbUmgmFrQDTJhewlbJfC99Y7ZNy8zUFnOLv9k&maxwidth=480	/api/map/place-photo?ref=Ab43m-sgaHcHiJtcCqjYQnIfjSAqWMqIIYBgQQrxx0BMfpDv_hKEdla3Is2DBD-PG95iT9mza7Uuu5gO03vkQ4I3M_1-3F51mE8vGbMPM2l7oxem0axzHg4HKLvYmXVpazZ-SC9oS8gn8mqXuvrzoTSymVJyhzCycXwkM-WBhAZH0yUgZRp7mBaCE64knohHA8r-NKHSQV-cOxVMheT0h-RLtgLI_UCKA0tXeX5vwnKCPp3gNqMh4Lxgb9y_IAxGgzhAlFVs5P52-wh5RtmlP_rBmM8VGRHn58_O0HLHdJ7g-dIxoAetyte_CxFvHeyIQQ0gMj9No2Ke2nYKvnDtFNo4JRMymutfE0aGmzQavcT6a4Yuw1dk3BIx4gqoFF64SfP1MXyci8zbUmgmFrQDTJhewlbJfC99Y7ZNy8zUFnOLv9k&maxwidth=480	星期一: 09:00 – 17:00；星期二: 09:00 – 17:00；星期三: 09:00 – 17:00；星期四: 09:00 – 17:00；星期五: 09:00 – 17:00；星期六: 09:00 – 17:00；星期日: 09:00 – 17:00	096-245-5630	http://www.foodpal-kumamoto.jp/	https://maps.google.com/?cid=9816526802866295330	3.4	497	\N	t	self_drive	\N	\N	\N
fallback_7_1	cmpzwpb2s002wpn84v336roey	7	熊本拉麵黑亭 熊本車站本店	安排停留 熊本拉麵黑亭 熊本車站本店。	09:30	熊本拉麵黑亭 熊本車站本店	32.7861456	130.6917365	0	attraction	ai	熊本 建議停留點	2-chōme-1-23 Nihongi, Nishi Ward, Kumamoto, 860-0051日本	ChIJq6oOuPX0QDURYu8_pGXuLfI	/api/map/place-photo?ref=Ab43m-vCKOlFfbVm_72A6Biu-b2ldsIc04rLPpVQv1LdFNNa1hK9zJtrPVLHrBv_c5sbcselBeAcj9QLgALyFm2ZTptHgYuEp91tll5aE6aVdL4xL-SG1WyQWQ21CWDH9xHjRPdsPUV-tgMXRUbeuhPklqWH1C-57FwkoOaDBSf2ID7LByamTPBGTc6jSq1pIKYYLVO1dfgLj_b3bqU4QHB8Bw2PbVvC6DSOY0IL1zMLL3BAPmt0whPAJ6guu5prEMXhL3STv9F0bv0sdC_J7P0WgGJOSyWp6ZCgBipZFRziMiZjqgqAIuNK5avQjMf-75QXHQiLgRtoxpLPqub2IUQXAs7YTrL1es-IIzLHhRXyUGC8CzKrAKHENcwRiZUq95e6CuNImHM-6JIfquj443EHFFUk3MfDq8hCeTi7M-1_Uz2XiPIDaZvdmpE_MJkxhKPM&maxwidth=480	/api/map/place-photo?ref=Ab43m-vCKOlFfbVm_72A6Biu-b2ldsIc04rLPpVQv1LdFNNa1hK9zJtrPVLHrBv_c5sbcselBeAcj9QLgALyFm2ZTptHgYuEp91tll5aE6aVdL4xL-SG1WyQWQ21CWDH9xHjRPdsPUV-tgMXRUbeuhPklqWH1C-57FwkoOaDBSf2ID7LByamTPBGTc6jSq1pIKYYLVO1dfgLj_b3bqU4QHB8Bw2PbVvC6DSOY0IL1zMLL3BAPmt0whPAJ6guu5prEMXhL3STv9F0bv0sdC_J7P0WgGJOSyWp6ZCgBipZFRziMiZjqgqAIuNK5avQjMf-75QXHQiLgRtoxpLPqub2IUQXAs7YTrL1es-IIzLHhRXyUGC8CzKrAKHENcwRiZUq95e6CuNImHM-6JIfquj443EHFFUk3MfDq8hCeTi7M-1_Uz2XiPIDaZvdmpE_MJkxhKPM&maxwidth=480	星期一: 10:30 – 20:30；星期二: 10:30 – 20:30；星期三: 10:30 – 20:30；星期四: 10:30 – 20:30；星期五: 10:30 – 20:30；星期六: 10:30 – 21:00；星期日: 10:30 – 21:00	096-352-1648	http://kokutei.co.jp/	https://maps.google.com/?cid=17450866251445301090	3.9	3431	\N	t	\N	\N	\N	\N
fallback_7_meal_lunch	cmpzwpb2s002wpn84v336roey	7	FUJIWARA STEAK HOUSE / 熊本 / 餐廳 / 鐵板燒 / 和牛 / 牛排	安排在 FUJIWARA STEAK HOUSE / 熊本 / 餐廳 / 鐵板燒 / 和牛 / 牛排 用餐。	12:30	FUJIWARA STEAK HOUSE / 熊本 / 餐廳 / 鐵板燒 / 和牛 / 牛排	32.8014969	130.7101962	1	restaurant	ai	熊本 lunch	日本〒860-0801 Kumamoto, Chuo Ward, Anseimachi, 6−２ ダイバシティ3F	ChIJ73VHnb71QDURZ4EbjE2uxFo	/api/map/place-photo?ref=Ab43m-s8BXYG7v70V6_WkL9-96K5YZg-ksWRhzceDG34PFSBVtFieXCjmvOUBSw3MbY1dnjXXamHVflJofmX2D--qKH4ed7TTKywGB90eAz9cKbn4cmZABND-ssBKBAUlqtSEyscmde8E3l9FzjfBbqQ2qagL64XnBz7Uqu7Op0sVXClfl2pA1rYlpd8g4DCGXXK9BKVB5OKs_llbiWGN0wDc3VJLTTYth13uWppLbdWLk1N_gA2WY1ASDFshOQUl7U9aF_1pypI1JvLB7rDHGrElFMOCner1ROYQgpyTtXmPjwlJse4qMiKNzPN9b47b_nMPni1fEQdF9SlOt35D23UpwMg_oVPVUgPwUEgGIednNWrlgjDoqoAKwI8IwIkFEXnFTOjGjnWpNGLnNaBZjlh3qF6It8q7oAKKMMFH1shUCg&maxwidth=480	/api/map/place-photo?ref=Ab43m-s8BXYG7v70V6_WkL9-96K5YZg-ksWRhzceDG34PFSBVtFieXCjmvOUBSw3MbY1dnjXXamHVflJofmX2D--qKH4ed7TTKywGB90eAz9cKbn4cmZABND-ssBKBAUlqtSEyscmde8E3l9FzjfBbqQ2qagL64XnBz7Uqu7Op0sVXClfl2pA1rYlpd8g4DCGXXK9BKVB5OKs_llbiWGN0wDc3VJLTTYth13uWppLbdWLk1N_gA2WY1ASDFshOQUl7U9aF_1pypI1JvLB7rDHGrElFMOCner1ROYQgpyTtXmPjwlJse4qMiKNzPN9b47b_nMPni1fEQdF9SlOt35D23UpwMg_oVPVUgPwUEgGIednNWrlgjDoqoAKwI8IwIkFEXnFTOjGjnWpNGLnNaBZjlh3qF6It8q7oAKKMMFH1shUCg&maxwidth=480	星期一: 17:00 – 22:00；星期二: 17:00 – 22:00；星期三: 17:00 – 22:00；星期四: 17:00 – 22:00；星期五: 17:00 – 22:00；星期六: 17:00 – 22:00；星期日: 17:00 – 22:00	096-355-8778	https://hitosara.com/0020007433/	https://maps.google.com/?cid=6540544206935130471	4.7	35	\N	t	self_drive	\N	\N	\N
fallback_7_3	cmpzwpb2s002wpn84v336roey	7	馬肉 SUGANOYA Ginza Street Store	安排停留 馬肉 SUGANOYA Ginza Street Store。	14:30	馬肉 SUGANOYA Ginza Street Store	32.8006975	130.7071243	2	activity	ai	熊本 建議停留點	日本〒860-0807 Kumamoto, Chuo Ward, Shimotōri, 1-chōme−9−１ ダイワロイネットホテル 熊本銀座通り PREMIER ２F	ChIJ8QMSLA30QDURS58RWidtb9c	/api/map/place-photo?ref=Ab43m-tqqfofpDv8CK65o9WDO3kEZwyrLaXQ2KsfCGedwwMGNGu9-ZT2y9lOE30IFs77HozexS_QQjZya6p9xYdmWceVf2dhWEoRfRsd9wnl-Npdr6X6SBDm1CTsSD0gTrqzOLcW1XX48v8z1iHElvciY4P_izsyiIhHXXo0K_ebcRqjvD9ma2W6hIQrU4ZXuRF6nWc0h2rFWFBG-8bdtA4DZDl9sy3wnai_45kObMBbCZkUxBb9kz32Ca1USIta5oCZVzWWzFWePJ1ljvdp7swxHa1NO12USeB0zgtjX7UL2dn3JCHqqL5I2K0U5YUMxgNetNlqsKqtQgqoHjGjN_k31_QkBEk2GlG_Kec9_Z-cXEIBws3Jp6WrEMkfo-WGkCWofgcKDtlu2W6LZU0DPZbreOOS1wPFanb2QxbdFZl-jLcvyx7U0Ct-4s4q35Igjw&maxwidth=480	/api/map/place-photo?ref=Ab43m-tqqfofpDv8CK65o9WDO3kEZwyrLaXQ2KsfCGedwwMGNGu9-ZT2y9lOE30IFs77HozexS_QQjZya6p9xYdmWceVf2dhWEoRfRsd9wnl-Npdr6X6SBDm1CTsSD0gTrqzOLcW1XX48v8z1iHElvciY4P_izsyiIhHXXo0K_ebcRqjvD9ma2W6hIQrU4ZXuRF6nWc0h2rFWFBG-8bdtA4DZDl9sy3wnai_45kObMBbCZkUxBb9kz32Ca1USIta5oCZVzWWzFWePJ1ljvdp7swxHa1NO12USeB0zgtjX7UL2dn3JCHqqL5I2K0U5YUMxgNetNlqsKqtQgqoHjGjN_k31_QkBEk2GlG_Kec9_Z-cXEIBws3Jp6WrEMkfo-WGkCWofgcKDtlu2W6LZU0DPZbreOOS1wPFanb2QxbdFZl-jLcvyx7U0Ct-4s4q35Igjw&maxwidth=480	星期一: 11:30 – 14:30, 17:00 – 22:00；星期二: 11:30 – 14:30, 17:00 – 22:00；星期三: 11:30 – 14:30, 17:00 – 22:00；星期四: 11:30 – 14:30, 17:00 – 22:00；星期五: 11:30 – 14:30, 17:00 – 22:00；星期六: 11:30 – 14:30, 17:00 – 22:00；星期日: 11:30 – 14:30, 17:00 – 22:00	096-312-3618	http://service.suganoya.com/ginzadori/	https://maps.google.com/?cid=15523746456351645515	4.4	1070	\N	t	self_drive	\N	\N	\N
fallback_1_4	cmpzwsz0y00ampn84jk9wktky	1	芝加哥藝術博物館	安排停留 芝加哥藝術博物館。	16:30	芝加哥藝術博物館	41.8796031	-87.6223504	3	activity	ai	芝加哥 建議停留點	111 S Michigan Ave, Chicago, IL 60603美國	ChIJlUbZ4qMsDogR3tCinMzzKUg	/api/map/place-photo?ref=Ab43m-tkpRSEd1RHNvk7FVnO4h495_eLDfsxh3v3SNnmKQZPQ0QRcL0Fi_W96CEziSaG9qvX54zWYKJJJlpo5eV-Bj6Bd3Mclwo8wn__bq1SNxv7tA97D8ELoWK22aKp2SmvoMLlz_O1kKL_f_NuNYQDqzJm4jnp72lPLHoRN2FfbOZJ1RnKki1J4hu9L5bDiTuwa2W6a1pnG_kWyU4SSudVZuzCNwBtSSTEnwtxWO48rFZ6sOjkwDdLu0LJE06_3aMMYDQ1jdW0EY0cAduTjJKYDkrE_HC6K5icU-9865RCmJR1nrq0QKFSn6gZ5WeoQ8G-2Ta-KaDPnwo8E4XB-0wpZeoFjKUhcQmx8z6aFXxiquaeYHvPJf7YQBUy19znx7AtfLmGpIuzZVF1M-eFyqPAJF5FIGNu8z9c6repWgeJacr6ug&maxwidth=480	/api/map/place-photo?ref=Ab43m-tkpRSEd1RHNvk7FVnO4h495_eLDfsxh3v3SNnmKQZPQ0QRcL0Fi_W96CEziSaG9qvX54zWYKJJJlpo5eV-Bj6Bd3Mclwo8wn__bq1SNxv7tA97D8ELoWK22aKp2SmvoMLlz_O1kKL_f_NuNYQDqzJm4jnp72lPLHoRN2FfbOZJ1RnKki1J4hu9L5bDiTuwa2W6a1pnG_kWyU4SSudVZuzCNwBtSSTEnwtxWO48rFZ6sOjkwDdLu0LJE06_3aMMYDQ1jdW0EY0cAduTjJKYDkrE_HC6K5icU-9865RCmJR1nrq0QKFSn6gZ5WeoQ8G-2Ta-KaDPnwo8E4XB-0wpZeoFjKUhcQmx8z6aFXxiquaeYHvPJf7YQBUy19znx7AtfLmGpIuzZVF1M-eFyqPAJF5FIGNu8z9c6repWgeJacr6ug&maxwidth=480	星期一: 11:00 – 17:00；星期二: 休息；星期三: 11:00 – 17:00；星期四: 11:00 – 20:00；星期五: 11:00 – 17:00；星期六: 11:00 – 17:00；星期日: 11:00 – 17:00	(312) 443-3600	https://www.artic.edu/	https://maps.google.com/?cid=5199955304902742238	4.8	38032	\N	t	ai_recommend	\N	\N	\N
fallback_2_4	cmpzwsz0y00ampn84jk9wktky	2	SavorWe	安排停留 SavorWe。	16:30	SavorWe	41.8884096	-87.6354498	3	activity	ai	芝加哥 建議停留點	222 W Merchandise Mart Plaza #1212, Chicago, IL 60654美國	ChIJ_VRhq_MtDogRgn4fV1AVnb0	/api/map/place-photo?ref=Ab43m-tSVndxyp5wqVWdgb9I61RTyJtUk710VX-Uutns5GwEIvbIUFpuhLICV1iZM4xXJPBcsHauJg5dk1BAWh0h_0516RK9BluI7inAEp5h5XUSEhIUvcSY1G_5r46vkCh-aJLxFvwiKpI-qXg_u86sAJz13CMfls0w9RnLjovwiKZWl3gK8e2eb_JSCcOlPCeLYa0bRuOfFjBlrf4Vph_Hr19D3ReaDAmwowub924c0vjQPKDB0eEcbd0FmBVPKfwLZKtKIW25oN2IX20SEcjTpf3p3-8RXZbAnVLCgxAQ8_Qp0lGdUjis489kdnccbImJBbVvCVEngdsWL2GGdxQiWtOv2KTzEsMqTkJcWI4OfllcMdZfL7oNdI_Qv16SSiEsaUjShGvGUHilPVpya-Zpyxu13DYxz1LQMMbqEDWf9-ANqtXlnLuusUmLcJ2PjlYO&maxwidth=480	/api/map/place-photo?ref=Ab43m-tSVndxyp5wqVWdgb9I61RTyJtUk710VX-Uutns5GwEIvbIUFpuhLICV1iZM4xXJPBcsHauJg5dk1BAWh0h_0516RK9BluI7inAEp5h5XUSEhIUvcSY1G_5r46vkCh-aJLxFvwiKpI-qXg_u86sAJz13CMfls0w9RnLjovwiKZWl3gK8e2eb_JSCcOlPCeLYa0bRuOfFjBlrf4Vph_Hr19D3ReaDAmwowub924c0vjQPKDB0eEcbd0FmBVPKfwLZKtKIW25oN2IX20SEcjTpf3p3-8RXZbAnVLCgxAQ8_Qp0lGdUjis489kdnccbImJBbVvCVEngdsWL2GGdxQiWtOv2KTzEsMqTkJcWI4OfllcMdZfL7oNdI_Qv16SSiEsaUjShGvGUHilPVpya-Zpyxu13DYxz1LQMMbqEDWf9-ANqtXlnLuusUmLcJ2PjlYO&maxwidth=480	星期一: 24 小時營業；星期二: 24 小時營業；星期三: 24 小時營業；星期四: 24 小時營業；星期五: 24 小時營業；星期六: 24 小時營業；星期日: 24 小時營業	(224) 288-7088	https://savorwe.com/	https://maps.google.com/?cid=13663100279315201666	4.8	19	\N	t	ai_recommend	\N	\N	\N
fallback_3_4	cmpzwsz0y00ampn84jk9wktky	3	Giordano's	安排停留 Giordano's。	16:30	Giordano's	41.8851301	-87.62376119999999	3	activity	ai	芝加哥 建議停留點	130 E Randolph St, Chicago, IL 60601美國	ChIJh3i0BqYsDogR6yp0y6TFlOQ	/api/map/place-photo?ref=Ab43m-uXti1EjLkcHlwdFJh6Nzlgp1VZXIsnIFGrScYoVVdZJfDWBKsyMFTSuvO4JRrR7AwFKOyTmjdGnP3H_Mhd6IqWVIYk8HxakSwzvRwM_et8ilJBLC573OU4sAemAFlFdbFlzbj1fvIMMB89EkOCLDEAWgxAgDGzIVcXkhKDxlcK9KnnWecTIP5qAPkLUkRne1jpiGQTcnOD11kN_2pfCyigGEzdMpMyNFS5L7p-Jsv1489APAU9gZKxGwEIxkmznaQhUVOn_BAN1-epSGz2AVHnl34EygA03TaKHgS_SNvL5ZR5cv0ytEWfR2rm6ga7bcB-RHIy5yDadK8RdI2U7oVxoIB_7gJL-L9xkjSMEu2ZJVFcoEdCjOnadakjwOGqYUWmLlLhfaCADLc3KSmybIyuWkK1yeJdNUaSnGPz9EmmkWAytsMLBpngZgruQuob&maxwidth=480	/api/map/place-photo?ref=Ab43m-uXti1EjLkcHlwdFJh6Nzlgp1VZXIsnIFGrScYoVVdZJfDWBKsyMFTSuvO4JRrR7AwFKOyTmjdGnP3H_Mhd6IqWVIYk8HxakSwzvRwM_et8ilJBLC573OU4sAemAFlFdbFlzbj1fvIMMB89EkOCLDEAWgxAgDGzIVcXkhKDxlcK9KnnWecTIP5qAPkLUkRne1jpiGQTcnOD11kN_2pfCyigGEzdMpMyNFS5L7p-Jsv1489APAU9gZKxGwEIxkmznaQhUVOn_BAN1-epSGz2AVHnl34EygA03TaKHgS_SNvL5ZR5cv0ytEWfR2rm6ga7bcB-RHIy5yDadK8RdI2U7oVxoIB_7gJL-L9xkjSMEu2ZJVFcoEdCjOnadakjwOGqYUWmLlLhfaCADLc3KSmybIyuWkK1yeJdNUaSnGPz9EmmkWAytsMLBpngZgruQuob&maxwidth=480	星期一: 10:30 – 00:00；星期二: 10:30 – 00:00；星期三: 10:30 – 00:00；星期四: 10:30 – 00:00；星期五: 10:30 – 00:00；星期六: 10:30 – 00:00；星期日: 10:30 – 23:00	(312) 616-1200	https://giordanos.com/locations/prudential-plaza-millennium-park/	https://maps.google.com/?cid=16471007048779442923	4.5	25680	\N	t	ai_recommend	\N	\N	\N
fallback_4_4	cmpzwsz0y00ampn84jk9wktky	4	Eataly	安排停留 Eataly。	16:30	Eataly	41.8923302	-87.6262663	3	activity	ai	芝加哥 建議停留點	43 E Ohio St, Chicago, IL 60611美國	ChIJe_Fq2lctDogRTpK221p4Fmg	/api/map/place-photo?ref=Ab43m-s2d3uuxYeU_wXePkgc3KFZYEA-Ivkkjz17RbBU7PUEpX-TbYdaQL-RGYob-suR9RcjgAJHjQiuVsgpkz3kY019If9XYPggeM6PN5QZOxiZIDRWoaB48Gga12JON0GaHMLWt2zgURI_kO7Ds8yR0Gu_JueZpfQDgJ8ToXlQP9Yq5FdY8NJfTBAXEGeu0yqsa4OBhjJ-40IMXC8rmcMyQcVL95i4B3q4NXVF6UMvz9737IPXTZsXvscLMUTlkXWMkK3nHsZBaIU1FG2Xurab156mEIG-LYmaujLDPgObmYvyyuqGVT-R5rTxRX8JXGJ-lGyezu9esvB8zJog9uD2p38FVNaCNErrm3kzzsspw_oUxGablquk4BeBgXLjZo8wpNc0VKgivgAPs9AJErlRWxFJp5zgGPSkl-lMR8wt5ZNIu-P95TsYssrCT4jaBg&maxwidth=480	/api/map/place-photo?ref=Ab43m-s2d3uuxYeU_wXePkgc3KFZYEA-Ivkkjz17RbBU7PUEpX-TbYdaQL-RGYob-suR9RcjgAJHjQiuVsgpkz3kY019If9XYPggeM6PN5QZOxiZIDRWoaB48Gga12JON0GaHMLWt2zgURI_kO7Ds8yR0Gu_JueZpfQDgJ8ToXlQP9Yq5FdY8NJfTBAXEGeu0yqsa4OBhjJ-40IMXC8rmcMyQcVL95i4B3q4NXVF6UMvz9737IPXTZsXvscLMUTlkXWMkK3nHsZBaIU1FG2Xurab156mEIG-LYmaujLDPgObmYvyyuqGVT-R5rTxRX8JXGJ-lGyezu9esvB8zJog9uD2p38FVNaCNErrm3kzzsspw_oUxGablquk4BeBgXLjZo8wpNc0VKgivgAPs9AJErlRWxFJp5zgGPSkl-lMR8wt5ZNIu-P95TsYssrCT4jaBg&maxwidth=480	星期一: 07:00 – 22:00；星期二: 07:00 – 22:00；星期三: 07:00 – 22:00；星期四: 07:00 – 22:00；星期五: 07:00 – 23:00；星期六: 07:00 – 23:00；星期日: 07:00 – 22:00	(312) 521-8700	https://www.eataly.com/us_en/stores/chicago	https://maps.google.com/?cid=7500314561060704846	4.3	5528	\N	t	ai_recommend	\N	\N	\N
fallback_5_4	cmpzwsz0y00ampn84jk9wktky	5	Soul Vibez - Chicago	安排停留 Soul Vibez - Chicago。	16:30	Soul Vibez - Chicago	41.89679140000001	-87.6353086	3	activity	ai	芝加哥 建議停留點	226 W Chicago Ave, Chicago, IL 60654美國	ChIJVWe2u3TTD4gRShjDHqtvhNI	/api/map/place-photo?ref=Ab43m-sTD3EW6P_MgG9ep8vywHp3zwCAvUugTUsrF6k0775xKGD7m910E1mhczKTaXDdYhXWvftq8I6kPT3OY0vaUAFG07gvzfTdzQP3Pqlt68P536L5AEIks4ePire8PrZ8b_TYdk1MkCsFc3Pb3oUCHRdoeg3vQQW3iRCyWRXzAqLimoOebpBHRlz7dqmzN5VPOyuj4G929l-YvsKhXdEM8W-ZDUf7FKopFYxa7vYU1iePQkzwvRE_wR-GhRqoDaZtN-XtcssImc4_xQTrxtEYzz3d6Ib2Bl7lbuMdcyzEdUKyM7_lL49m86QbpVeDRi0Fjb57XtbnNxpft80n2uyBelEpDAJ-7_WJz8DmWjOdh-CQ8ZWcj8ue1OA2O0as0anJvP32effCh5wVj_W4k7XwsRMiIFTvMKuJOUVXo3CUT2YPaQuE&maxwidth=480	/api/map/place-photo?ref=Ab43m-sTD3EW6P_MgG9ep8vywHp3zwCAvUugTUsrF6k0775xKGD7m910E1mhczKTaXDdYhXWvftq8I6kPT3OY0vaUAFG07gvzfTdzQP3Pqlt68P536L5AEIks4ePire8PrZ8b_TYdk1MkCsFc3Pb3oUCHRdoeg3vQQW3iRCyWRXzAqLimoOebpBHRlz7dqmzN5VPOyuj4G929l-YvsKhXdEM8W-ZDUf7FKopFYxa7vYU1iePQkzwvRE_wR-GhRqoDaZtN-XtcssImc4_xQTrxtEYzz3d6Ib2Bl7lbuMdcyzEdUKyM7_lL49m86QbpVeDRi0Fjb57XtbnNxpft80n2uyBelEpDAJ-7_WJz8DmWjOdh-CQ8ZWcj8ue1OA2O0as0anJvP32effCh5wVj_W4k7XwsRMiIFTvMKuJOUVXo3CUT2YPaQuE&maxwidth=480	星期一: 13:00 – 21:00；星期二: 13:00 – 21:00；星期三: 13:00 – 21:00；星期四: 13:00 – 21:00；星期五: 13:00 – 21:00；星期六: 11:00 – 21:00；星期日: 11:00 – 21:00	(872) 342-2026	https://soulvibezinc.com/soulvibezwest?utm_source=google	https://maps.google.com/?cid=15169372225636866122	4.4	1273	\N	t	ai_recommend	\N	\N	\N
fallback_6_4	cmpzwsz0y00ampn84jk9wktky	6	Girl & The Goat	安排停留 Girl & The Goat。	16:30	Girl & The Goat	41.8841279	-87.6479354	3	activity	ai	芝加哥 建議停留點	809 W Randolph St, Chicago, IL 60607美國	ChIJs8mbNsUsDogRUnpg-b_IK5E	/api/map/place-photo?ref=Ab43m-vOgibXtq_hMSVzZSEO6Dme6vl4Ma1ebZYJQgGcWARK_jfJvgcYXcMH1aRxLS8JLDlAashHl77g-sCih6KPO8OWBNTrt7E3exKOlinKGkh0tBK0_MrfqxIIKryZOpN_LO2j0ab_8aiX_c-w8ifRGlt4HV7jgUudnsKHD8bUt-NJBHws-b0hLrPq2nLgjbD-9KidKsC3Aa-_Ku6iz1GPUgCCbVBHZtocmlkThSyX4ZR9EmOCW_bI3B82drVe35lwkaBw6jBniW8OyRnuycvNYlLGff7g2t11fvaHGDmeOo91UutA1pzCTutUioGAmtMrYxpv8ZiaziATXSr_7eF7yYnzVJYHCw-aIH1O-m7Y2YGgqszBmy2LRdWfphTcEpeZ_y4U912k4g-i0hSeFG0A03hVtQ1h_4rAOqV7g_YJ_IHgS2H1&maxwidth=480	/api/map/place-photo?ref=Ab43m-vOgibXtq_hMSVzZSEO6Dme6vl4Ma1ebZYJQgGcWARK_jfJvgcYXcMH1aRxLS8JLDlAashHl77g-sCih6KPO8OWBNTrt7E3exKOlinKGkh0tBK0_MrfqxIIKryZOpN_LO2j0ab_8aiX_c-w8ifRGlt4HV7jgUudnsKHD8bUt-NJBHws-b0hLrPq2nLgjbD-9KidKsC3Aa-_Ku6iz1GPUgCCbVBHZtocmlkThSyX4ZR9EmOCW_bI3B82drVe35lwkaBw6jBniW8OyRnuycvNYlLGff7g2t11fvaHGDmeOo91UutA1pzCTutUioGAmtMrYxpv8ZiaziATXSr_7eF7yYnzVJYHCw-aIH1O-m7Y2YGgqszBmy2LRdWfphTcEpeZ_y4U912k4g-i0hSeFG0A03hVtQ1h_4rAOqV7g_YJ_IHgS2H1&maxwidth=480	星期一: 16:30 – 22:00；星期二: 16:30 – 22:00；星期三: 16:30 – 22:00；星期四: 16:30 – 22:00；星期五: 16:30 – 23:00；星期六: 16:30 – 23:00；星期日: 10:00 – 14:00, 16:30 – 22:00	(312) 492-6262	http://www.girlandthegoat.com/	https://maps.google.com/?cid=10460675286346267218	4.7	7813	\N	t	ai_recommend	\N	\N	\N
manual_b10111b4-e4a9-4f25-8b9f-e1371e6d525f	cmpzx2g0c00qrpn84bq927bsc	1	嘉義大學 新民校區	No. 580號, Xinmin Rd, Meiyuan Village, West District, Chiayi City, Taiwan 600	16:00	嘉義大學 新民校區	23.4637468	120.4427052	0	activity	manual	No. 580號, Xinmin Rd, Meiyuan Village, West District, Chiayi City, Taiwan 600	No. 580號, Xinmin Rd, Meiyuan Village, West District, Chiayi City, Taiwan 600	ChIJr5uO5xiUbjQRA_-dGJ-YouE	/api/map/place-photo?ref=AaVGc3nu-Qeju7eyiEGf_fIDJwfkiUeh-zdt8ow-5NddIRevYIFfQpiO4BmPcpRAYWd53jNQ7U9N0xl9yZBG5tycc355_iaJ6fOijgGzxxCBGW6IBtA7iKMijjTZnkA6CYtY4rkznWc_DBKo7wJJu9bl1ucaS2---P1iXlkW2uolGPMjrgcxh6gwWv-xuk05ysrjT3fwr9MDskEz8rcQ8Yfu6rgA-Y9OMQUv_J4_m2Y2vxIDaGlwJIoK2hgL_02ikZRoVPTXgzbKCWS5vXKmIu9oESG757gHWKATWby5xJVg-d_XVRDTddpo0nsravWKhGEFngJTJVmHHwyxpTdi0lYnrC_rIQubDNYCfSH8mCpKgYJRtAPI_D3hvJwh5eihqy0htkJ-4C2brNjAmQ-z8sscLV61GMDAE1JkkOJG0_-SvNxUNtLo&maxwidth=480	/api/map/place-photo?ref=AaVGc3nu-Qeju7eyiEGf_fIDJwfkiUeh-zdt8ow-5NddIRevYIFfQpiO4BmPcpRAYWd53jNQ7U9N0xl9yZBG5tycc355_iaJ6fOijgGzxxCBGW6IBtA7iKMijjTZnkA6CYtY4rkznWc_DBKo7wJJu9bl1ucaS2---P1iXlkW2uolGPMjrgcxh6gwWv-xuk05ysrjT3fwr9MDskEz8rcQ8Yfu6rgA-Y9OMQUv_J4_m2Y2vxIDaGlwJIoK2hgL_02ikZRoVPTXgzbKCWS5vXKmIu9oESG757gHWKATWby5xJVg-d_XVRDTddpo0nsravWKhGEFngJTJVmHHwyxpTdi0lYnrC_rIQubDNYCfSH8mCpKgYJRtAPI_D3hvJwh5eihqy0htkJ-4C2brNjAmQ-z8sscLV61GMDAE1JkkOJG0_-SvNxUNtLo&maxwidth=480	星期一: 08:00 – 21:45；星期二: 08:00 – 21:45；星期三: 08:00 – 21:45；星期四: 08:00 – 21:45；星期五: 08:00 – 21:45；星期六: 休息；星期日: 休息	05 271 7000	https://www.ncyu.edu.tw/newsite/	https://maps.google.com/?cid=16258725413841141507	4.4	292	\N	t	Bicycling	\N	\N	\N
manual_d80fb115-4e0a-4ae4-b201-e93bac924393	cmpzx2g0c00qrpn84bq927bsc	1	工具車	No. 246-1號, Lanjing St, Xirong Village, West District, Chiayi City, Taiwan 600	17:11	工具車	23.4772956	120.446883	1	activity	manual	No. 246-1號, Lanjing St, Xirong Village, West District, Chiayi City, Taiwan 600	No. 246-1號, Lanjing St, Xirong Village, West District, Chiayi City, Taiwan 600	ChIJuRjHqNyVbjQRiDeLtYwWJdw	/api/map/place-photo?ref=AaVGc3m4LrB8-oQXNiYfes3mg7V4ase90iewgj_hWZPkG3McmwgAJI4Xj5CtESjby5iFIg5ck-vVttTaRWvPEHEEElhnzqPyHqrTkVUdLYPhEATEhojVe7DgtQid39V8rEI4VtntuL0nQCuUZQOMDQqJIICSwr_oyV386o-Ma08McaSa0hkO09TbrHeMIjtzN3Z8mHUNYNSjSC3CCB1fjeTIddwla_CvLXlBNeZcrS7RsxJTh4fJewHUjW8d9DAHiG95xzflRfYauuGg5_323xl6mKF8dpLqQTaPUOQeiZeS3PGfhuKeiCkMjHSHVLTycBdI-hH61Ytz-eGvoXZKG5jWPRQOUnyk5DZZZ8K6_7wtxV2yjO8pcDSXbNtnWGdgD7PTzNtYxYB8EHFxe_JpEMTIU8Ckk5pcQ8iIXZwbTX1Orzi5s0M&maxwidth=480	/api/map/place-photo?ref=AaVGc3m4LrB8-oQXNiYfes3mg7V4ase90iewgj_hWZPkG3McmwgAJI4Xj5CtESjby5iFIg5ck-vVttTaRWvPEHEEElhnzqPyHqrTkVUdLYPhEATEhojVe7DgtQid39V8rEI4VtntuL0nQCuUZQOMDQqJIICSwr_oyV386o-Ma08McaSa0hkO09TbrHeMIjtzN3Z8mHUNYNSjSC3CCB1fjeTIddwla_CvLXlBNeZcrS7RsxJTh4fJewHUjW8d9DAHiG95xzflRfYauuGg5_323xl6mKF8dpLqQTaPUOQeiZeS3PGfhuKeiCkMjHSHVLTycBdI-hH61Ytz-eGvoXZKG5jWPRQOUnyk5DZZZ8K6_7wtxV2yjO8pcDSXbNtnWGdgD7PTzNtYxYB8EHFxe_JpEMTIU8Ckk5pcQ8iIXZwbTX1Orzi5s0M&maxwidth=480	星期一: 休息；星期二: 11:00 – 20:00；星期三: 11:00 – 20:00；星期四: 11:00 – 20:00；星期五: 11:00 – 20:00；星期六: 11:00 – 20:00；星期日: 11:00 – 20:00	0989 875 131	https://www.facebook.com/%E5%B7%A5%E5%85%B7%E8%BB%8A%E7%BE%A9%E5%A4%A7%E5%88%A9%E9%BA%B5-2192969084277097/	https://maps.google.com/?cid=15863110056079472520	4.5	313	\N	t	Walking	23	1566	\N
fallback_7_4	cmpzx2g0c00qrpn84bq927bsc	7	穀谷	安排停留 穀谷。	16:30	穀谷	23.4785788	120.4514206	0	activity	ai	嘉義 建議停留點	600嘉義市東區中央里興中街132號	ChIJY-fyOoWVbjQRLtVQ32Btz5s	/api/map/place-photo?ref=Ab43m-tPUI03TcS-fqWUMrHcvMw2F7w8dHxXNDvvEvDQcQKwK33LRzWZVpXkHvQzUdiBvHrKd8wx7pQlhOJDuwMToHzM9dFHBxC19UfJdj78OWTAavgeURbUkftvjXoR8jNhyUm2X2FKZuYeNuZvR4N6m5FIR-i0vVACxjfGb8UcwPr_dYooBN4D6fZGIw6xEtpsC0pkbYMOsa1jJL3tjQ7L4z57qVJdJO9KUNmxkaefzPrEdDhX_PCzyZfgDHXWbS9mBBfNn1t9QDo0p1-FBoHzCwDdZmp-7ObKGbKceJl_gqG0llj0c50-z4RINWR6E_sXcQid1WHp1NfixlpIrI5DSeE-7rC9O9brDs7BlSGG0m3oE9NCv_TxKpGxH_HYTpfXdmdGIu3BUVKcgt1HEA0lsIPj4694rFoFzPBoSq2OHSXSCjSaKscfVDOlgnLEtN8c&maxwidth=480	/api/map/place-photo?ref=Ab43m-tPUI03TcS-fqWUMrHcvMw2F7w8dHxXNDvvEvDQcQKwK33LRzWZVpXkHvQzUdiBvHrKd8wx7pQlhOJDuwMToHzM9dFHBxC19UfJdj78OWTAavgeURbUkftvjXoR8jNhyUm2X2FKZuYeNuZvR4N6m5FIR-i0vVACxjfGb8UcwPr_dYooBN4D6fZGIw6xEtpsC0pkbYMOsa1jJL3tjQ7L4z57qVJdJO9KUNmxkaefzPrEdDhX_PCzyZfgDHXWbS9mBBfNn1t9QDo0p1-FBoHzCwDdZmp-7ObKGbKceJl_gqG0llj0c50-z4RINWR6E_sXcQid1WHp1NfixlpIrI5DSeE-7rC9O9brDs7BlSGG0m3oE9NCv_TxKpGxH_HYTpfXdmdGIu3BUVKcgt1HEA0lsIPj4694rFoFzPBoSq2OHSXSCjSaKscfVDOlgnLEtN8c&maxwidth=480	星期一: 11:00 – 15:01, 17:00 – 21:01；星期二: 11:00 – 15:01, 17:00 – 21:01；星期三: 11:00 – 15:01, 17:00 – 21:01；星期四: 11:00 – 15:01, 17:00 – 21:01；星期五: 11:00 – 15:01, 17:00 – 21:01；星期六: 11:00 – 15:01, 17:00 – 21:01；星期日: 11:00 – 15:01, 17:00 – 21:01	0919 330 115	https://www.facebook.com/goodgoodlifestyle	https://maps.google.com/?cid=11227312658888840494	4.4	1023	\N	t	self_drive	\N	\N	\N
fallback_7_meal_dinner	cmpzx2g0c00qrpn84bq927bsc	7	穀谷	安排在 穀谷 用餐。	18:30	穀谷	23.4785788	120.4514206	1	restaurant	ai	嘉義 dinner	600嘉義市東區中央里興中街132號	ChIJY-fyOoWVbjQRLtVQ32Btz5s	/api/map/place-photo?ref=Ab43m-tPUI03TcS-fqWUMrHcvMw2F7w8dHxXNDvvEvDQcQKwK33LRzWZVpXkHvQzUdiBvHrKd8wx7pQlhOJDuwMToHzM9dFHBxC19UfJdj78OWTAavgeURbUkftvjXoR8jNhyUm2X2FKZuYeNuZvR4N6m5FIR-i0vVACxjfGb8UcwPr_dYooBN4D6fZGIw6xEtpsC0pkbYMOsa1jJL3tjQ7L4z57qVJdJO9KUNmxkaefzPrEdDhX_PCzyZfgDHXWbS9mBBfNn1t9QDo0p1-FBoHzCwDdZmp-7ObKGbKceJl_gqG0llj0c50-z4RINWR6E_sXcQid1WHp1NfixlpIrI5DSeE-7rC9O9brDs7BlSGG0m3oE9NCv_TxKpGxH_HYTpfXdmdGIu3BUVKcgt1HEA0lsIPj4694rFoFzPBoSq2OHSXSCjSaKscfVDOlgnLEtN8c&maxwidth=480	/api/map/place-photo?ref=Ab43m-tPUI03TcS-fqWUMrHcvMw2F7w8dHxXNDvvEvDQcQKwK33LRzWZVpXkHvQzUdiBvHrKd8wx7pQlhOJDuwMToHzM9dFHBxC19UfJdj78OWTAavgeURbUkftvjXoR8jNhyUm2X2FKZuYeNuZvR4N6m5FIR-i0vVACxjfGb8UcwPr_dYooBN4D6fZGIw6xEtpsC0pkbYMOsa1jJL3tjQ7L4z57qVJdJO9KUNmxkaefzPrEdDhX_PCzyZfgDHXWbS9mBBfNn1t9QDo0p1-FBoHzCwDdZmp-7ObKGbKceJl_gqG0llj0c50-z4RINWR6E_sXcQid1WHp1NfixlpIrI5DSeE-7rC9O9brDs7BlSGG0m3oE9NCv_TxKpGxH_HYTpfXdmdGIu3BUVKcgt1HEA0lsIPj4694rFoFzPBoSq2OHSXSCjSaKscfVDOlgnLEtN8c&maxwidth=480	星期一: 11:00 – 15:01, 17:00 – 21:01；星期二: 11:00 – 15:01, 17:00 – 21:01；星期三: 11:00 – 15:01, 17:00 – 21:01；星期四: 11:00 – 15:01, 17:00 – 21:01；星期五: 11:00 – 15:01, 17:00 – 21:01；星期六: 11:00 – 15:01, 17:00 – 21:01；星期日: 11:00 – 15:01, 17:00 – 21:01	0919 330 115	https://www.facebook.com/goodgoodlifestyle	https://maps.google.com/?cid=11227312658888840494	4.4	1023	\N	t	self_drive	\N	\N	\N
fallback_8_1	cmpzx2g0c00qrpn84bq927bsc	8	穀谷	安排停留 穀谷。	09:30	穀谷	23.4785788	120.4514206	0	attraction	ai	嘉義 建議停留點	600嘉義市東區中央里興中街132號	ChIJY-fyOoWVbjQRLtVQ32Btz5s	/api/map/place-photo?ref=Ab43m-tPUI03TcS-fqWUMrHcvMw2F7w8dHxXNDvvEvDQcQKwK33LRzWZVpXkHvQzUdiBvHrKd8wx7pQlhOJDuwMToHzM9dFHBxC19UfJdj78OWTAavgeURbUkftvjXoR8jNhyUm2X2FKZuYeNuZvR4N6m5FIR-i0vVACxjfGb8UcwPr_dYooBN4D6fZGIw6xEtpsC0pkbYMOsa1jJL3tjQ7L4z57qVJdJO9KUNmxkaefzPrEdDhX_PCzyZfgDHXWbS9mBBfNn1t9QDo0p1-FBoHzCwDdZmp-7ObKGbKceJl_gqG0llj0c50-z4RINWR6E_sXcQid1WHp1NfixlpIrI5DSeE-7rC9O9brDs7BlSGG0m3oE9NCv_TxKpGxH_HYTpfXdmdGIu3BUVKcgt1HEA0lsIPj4694rFoFzPBoSq2OHSXSCjSaKscfVDOlgnLEtN8c&maxwidth=480	/api/map/place-photo?ref=Ab43m-tPUI03TcS-fqWUMrHcvMw2F7w8dHxXNDvvEvDQcQKwK33LRzWZVpXkHvQzUdiBvHrKd8wx7pQlhOJDuwMToHzM9dFHBxC19UfJdj78OWTAavgeURbUkftvjXoR8jNhyUm2X2FKZuYeNuZvR4N6m5FIR-i0vVACxjfGb8UcwPr_dYooBN4D6fZGIw6xEtpsC0pkbYMOsa1jJL3tjQ7L4z57qVJdJO9KUNmxkaefzPrEdDhX_PCzyZfgDHXWbS9mBBfNn1t9QDo0p1-FBoHzCwDdZmp-7ObKGbKceJl_gqG0llj0c50-z4RINWR6E_sXcQid1WHp1NfixlpIrI5DSeE-7rC9O9brDs7BlSGG0m3oE9NCv_TxKpGxH_HYTpfXdmdGIu3BUVKcgt1HEA0lsIPj4694rFoFzPBoSq2OHSXSCjSaKscfVDOlgnLEtN8c&maxwidth=480	星期一: 11:00 – 15:01, 17:00 – 21:01；星期二: 11:00 – 15:01, 17:00 – 21:01；星期三: 11:00 – 15:01, 17:00 – 21:01；星期四: 11:00 – 15:01, 17:00 – 21:01；星期五: 11:00 – 15:01, 17:00 – 21:01；星期六: 11:00 – 15:01, 17:00 – 21:01；星期日: 11:00 – 15:01, 17:00 – 21:01	0919 330 115	https://www.facebook.com/goodgoodlifestyle	https://maps.google.com/?cid=11227312658888840494	4.4	1023	\N	t	\N	\N	\N	\N
fallback_8_meal_lunch	cmpzx2g0c00qrpn84bq927bsc	8	巷子裡的小餐館（建議電話先預訂）	安排在 巷子裡的小餐館（建議電話先預訂） 用餐。	12:30	巷子裡的小餐館（建議電話先預訂）	23.4763225	120.4449787	1	restaurant	ai	嘉義 lunch	600嘉義市西區西榮里延平街373號	ChIJj5FPfi-UbjQR5SME57SkJE4	/api/map/place-photo?ref=Ab43m-uIDxY2GDYFt6iE7PU18UjoSPk5keuWL15ANBfunAL9Fr4ZKQQME7fk4W5hoIW-ovjfzfFzKldgZZjMD3tUD2DQodEFOOEG8hVc_QClvCWYN58arXGOKiunMUGa5HoLc7-plJ0elj4zU5jZld5oQmGMql1Ny7KGyOsYd2i9hgpPzoUVEP16CfkCq-0OzQAw__U3t3JoB-luBPadW2OnC1Hc7yWMfQLh8nnD0xyujcIGPUmPCsvDm_GdMueeaPIzkbPwzQKAlCDr_UHNmuaxJD8S2HF57MVDCSOo44jMHLBwxkWPGWN5-k0MaHFVLZ7CzwFBNnKm9BLWUyJMNX1w6EbWRvg0WsGFP_yUqGftAhKIC_nb8jtMNLE-yUuwjmS56Mffc3J5IGs-LXQ8QUafGFPI7W68W0DjzRDkIY0fPdUqA0UU&maxwidth=480	/api/map/place-photo?ref=Ab43m-uIDxY2GDYFt6iE7PU18UjoSPk5keuWL15ANBfunAL9Fr4ZKQQME7fk4W5hoIW-ovjfzfFzKldgZZjMD3tUD2DQodEFOOEG8hVc_QClvCWYN58arXGOKiunMUGa5HoLc7-plJ0elj4zU5jZld5oQmGMql1Ny7KGyOsYd2i9hgpPzoUVEP16CfkCq-0OzQAw__U3t3JoB-luBPadW2OnC1Hc7yWMfQLh8nnD0xyujcIGPUmPCsvDm_GdMueeaPIzkbPwzQKAlCDr_UHNmuaxJD8S2HF57MVDCSOo44jMHLBwxkWPGWN5-k0MaHFVLZ7CzwFBNnKm9BLWUyJMNX1w6EbWRvg0WsGFP_yUqGftAhKIC_nb8jtMNLE-yUuwjmS56Mffc3J5IGs-LXQ8QUafGFPI7W68W0DjzRDkIY0fPdUqA0UU&maxwidth=480	星期一: 休息；星期二: 11:30 – 14:30, 17:30 – 21:00；星期三: 11:30 – 14:30, 17:30 – 21:00；星期四: 11:30 – 14:30, 17:30 – 21:00；星期五: 11:30 – 14:30, 17:30 – 21:00；星期六: 11:30 – 14:30, 17:30 – 21:00；星期日: 11:30 – 14:30, 17:30 – 21:00	05 223 3737	http://facebook.com/373kitchen	https://maps.google.com/?cid=5630806530996839397	4.6	1817	\N	t	self_drive	\N	\N	\N
fallback_8_3	cmpzx2g0c00qrpn84bq927bsc	8	三采田美味廚坊/嘉義美食 嘉義餐廳 嘉義小吃 嘉義火鍋 東區美食 嘉義火車站美食	安排停留 三采田美味廚坊/嘉義美食 嘉義餐廳 嘉義小吃 嘉義火鍋 東區美食 嘉義火車站美食。	14:30	三采田美味廚坊/嘉義美食 嘉義餐廳 嘉義小吃 嘉義火鍋 東區美食 嘉義火車站美食	23.4952461	120.4509366	2	activity	ai	嘉義 建議停留點	600嘉義市東區中庄里台斗街217號	ChIJP5xJE8-VbjQRJLukAcEjdIM	/api/map/place-photo?ref=Ab43m-vHC_NGfSWfHra5h0POXWzob0A1rzyWRKLZqWibUZ_F2jnZ6C6WMjgegRglFftqqfoK7_vXwDQe4JRoK8XStzV4ejAUSocU1E5BOQWsxo1E4a6tMR7F4mPTtx6kL0q8vdwP-eDK6hnPG-OC231PLQ12DgT0nZ92zib0cQ9_ISs7iSkqt116UAyOivhlKtWjDM3iZNJKLMVlpMF6svrS15irtFePr96ohp8RZn7zMiDnZhf9qI9Pm_TewOglCcnQC-NDj0mrmstjthiBg8-y3oudvRg3yrnLn0OuY3lRDttjlv26-vHiKT8Snrr3-cLMSdq-nv93spHz1OU2MjJoTl0A14dl6TBeveG4mjfEHvU_bTiEji5_RXqh1g0f5FB2m44PwTeWyT_9U_nUQTYjDQEgyyDdhMx5Bsc2LHEolape9w&maxwidth=480	/api/map/place-photo?ref=Ab43m-vHC_NGfSWfHra5h0POXWzob0A1rzyWRKLZqWibUZ_F2jnZ6C6WMjgegRglFftqqfoK7_vXwDQe4JRoK8XStzV4ejAUSocU1E5BOQWsxo1E4a6tMR7F4mPTtx6kL0q8vdwP-eDK6hnPG-OC231PLQ12DgT0nZ92zib0cQ9_ISs7iSkqt116UAyOivhlKtWjDM3iZNJKLMVlpMF6svrS15irtFePr96ohp8RZn7zMiDnZhf9qI9Pm_TewOglCcnQC-NDj0mrmstjthiBg8-y3oudvRg3yrnLn0OuY3lRDttjlv26-vHiKT8Snrr3-cLMSdq-nv93spHz1OU2MjJoTl0A14dl6TBeveG4mjfEHvU_bTiEji5_RXqh1g0f5FB2m44PwTeWyT_9U_nUQTYjDQEgyyDdhMx5Bsc2LHEolape9w&maxwidth=480	星期一: 休息；星期二: 休息；星期三: 11:00 – 14:00, 17:00 – 20:00；星期四: 11:00 – 14:00, 17:00 – 20:00；星期五: 11:00 – 14:00, 17:00 – 20:00；星期六: 11:00 – 14:00, 17:00 – 20:00；星期日: 11:00 – 14:00, 17:00 – 20:00	05 276 3785	https://inline.app/booking/-OetL895hPDVb8Zk814C:inline-live-3/-OetL8FA1pr7E0QKPO3I	https://maps.google.com/?cid=9472235228130229028	4.6	617	\N	t	self_drive	\N	\N	\N
\.


--
-- Data for Name: trip_publications; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.trip_publications (id, "tripId", "publisherId", title, "coverImageUrl", days, destination, "searchText", "snapshotJson", "publisherImage", "publishedAt", "revokedAt") FROM stdin;
\.


--
-- Data for Name: trips; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.trips (id, "userId", title, destination, days, "createdAt", "updatedAt", "folderId", "coverImageUrl") FROM stdin;
cmpzwpb2s002wpn84v336roey	cmpzvydlg0000o17tqskqnik4	熊本 行程	熊本	7	2026-06-04 19:46:53.14	2026-06-04 19:47:29.166	\N	\N
cmpzwrvno0088pn84i5k3c5m7	cmpzvydlg0000o17tqskqnik4			0	2026-06-04 19:48:53.124	2026-06-04 19:48:53.124	\N	\N
cmpzwsz0y00ampn84jk9wktky	cmpzvydlg0000o17tqskqnik4	芝加哥	芝加哥	7	2026-06-04 19:49:44.146	2026-06-04 19:51:28.096	\N	\N
cmpzx2g0c00qrpn84bq927bsc	cmpzvydlg0000o17tqskqnik4	嘉義 行程	嘉義	8	2026-06-04 19:57:06.06	2026-06-05 09:35:25.444	\N	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.users (id, email, name, image, "emailVerified", "createdAt", "updatedAt", "passwordHash") FROM stdin;
cmpzvydlg0000o17tqskqnik4	albertlin94821@gmail.com	Tzu-Hsuan Lin	\N	\N	2026-06-04 19:25:56.693	2026-06-04 19:25:56.693	$2b$12$qejA98./DwZ3rSFaH0ETHOuodw.q80oxi6X/8gvGeedOof2t6QlZS
cmq2enhup0000p97rmqzrn9lp	user1@gmail.com	user1	\N	\N	2026-06-06 13:44:54.05	2026-06-06 13:44:54.05	$2b$12$UNRaVt9rZdX3aAdYdXbFXucRLowOYxnhAjprvEImr8ZkoMDUE1iXi
\.


--
-- Data for Name: verification_tokens; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.verification_tokens (identifier, token, expires) FROM stdin;
\.


--
-- Data for Name: video_interactions; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.video_interactions (id, "userId", "tripId", "videoId", source, "videoUrl", title, "interactionType", "analysisId", "summaryId", "watchDurationSeconds", progress, "extractedPlaces", "extractedTimestamps", metadata, "createdAt") FROM stdin;
dc12edbd-4599-4afd-9610-38951a5b6aeb	cmpzvydlg0000o17tqskqnik4	\N	D1_1NoFeZx8	\N	https://www.youtube.com/watch?v=D1_1NoFeZx8	【逛吃廣州美食】北京路商圈懷舊點心車！160元九款手工點心！高性價比！金旺旺｜粵式點心｜Dimsum｜美食推薦｜旅遊攻略｜Canton Food Tour｜Guangzhou China Travel	analyze	\N	D1_1NoFeZx8	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:47:31.668
d2014b6e-759e-4957-a6ce-a669b7c03a91	cmpzvydlg0000o17tqskqnik4	\N	iguuqXXQaDU	\N	https://www.youtube.com/watch?v=iguuqXXQaDU	【逛吃廣州美食】機場周邊最受歡迎農莊！新豐農莊！極品土豬肉、燒鵝、太和燒排骨｜美食推薦｜旅遊攻略｜Canton Food Tour｜Guangzhou China Travel	analyze	\N	iguuqXXQaDU	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:47:33.128
fe3d64e0-72d2-4573-89d5-98d9aa412e54	cmpzvydlg0000o17tqskqnik4	\N	zHaLpL_s1ZY	\N	https://www.youtube.com/watch?v=zHaLpL_s1ZY	2026日本無印良品美食開箱！原來這些料理包可以帶回台灣？綠咖哩人氣超高超好吃！季節限定抹茶饅頭必買！在家就能製作好喝奶昔？｜雙人徐✌️	analyze	\N	zHaLpL_s1ZY	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:47:34.475
5e192e11-e729-4179-a2e9-3fbeb7bbe7c4	cmpzvydlg0000o17tqskqnik4	\N	kCF1y5XVF7c	\N	https://www.youtube.com/watch?v=kCF1y5XVF7c	Amazing Street Food in Tainan, Taiwan’s Oldest City! (400 Years)	analyze	\N	kCF1y5XVF7c	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:47:35.72
aa883665-d545-41b8-937f-649882d0e113	cmpzvydlg0000o17tqskqnik4	\N	WxWUmtpj-Ko	\N	https://www.youtube.com/watch?v=WxWUmtpj-Ko	24H In Budapest - Hungarian Goulash & Christmas Market Street Food!	analyze	\N	WxWUmtpj-Ko	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:47:37.006
6376fff3-9410-4759-bca1-1ed849b7b12e	cmpzvydlg0000o17tqskqnik4	\N	ItfKeb3dzj8	\N	https://www.youtube.com/watch?v=ItfKeb3dzj8	一家能吃遍所有日本美食的店  Enjoy food from all over Japan in one restaurant	analyze	\N	ItfKeb3dzj8	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:47:38.171
a478442d-9bdd-43d1-ba48-3b192dc6c87c	cmpzvydlg0000o17tqskqnik4	\N	0EEKfajjUe0	\N	https://www.youtube.com/watch?v=0EEKfajjUe0	シカゴ旅行vlog🇺🇸2泊4日ひとり旅🇺🇸シカゴ美術館で絵画に浸る、建築巡り、スーパー・トレジョでお土産探し、初めてのシカゴ観光, The Art Institute of Chicago	analyze	\N	0EEKfajjUe0	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:51:30.414
8fe7a227-b83d-4585-86be-5413626e60ad	cmpzvydlg0000o17tqskqnik4	\N	ob5rNY0vTEs	\N	https://www.youtube.com/watch?v=ob5rNY0vTEs	Chicago in Fall Colors 🍂 | Museums, Coffee & Calm City Walks + Halloween Strolls	analyze	\N	ob5rNY0vTEs	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:51:31.643
2b355504-159a-4e73-8082-73f9086eb602	cmpzvydlg0000o17tqskqnik4	\N	x2o4-fUYNC0	\N	https://www.youtube.com/watch?v=x2o4-fUYNC0	Chicago🌈Art, Park, Cycling, Café Vibes🍨 & Jazz Fest. 🎺	analyze	\N	x2o4-fUYNC0	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:51:32.913
0096d611-e9bb-4771-8b5b-69f89c26f41a	cmpzvydlg0000o17tqskqnik4	\N	IxQdeuDrrFM	\N	https://www.youtube.com/watch?v=IxQdeuDrrFM	【空姐去窮遊】跟我返鄉下？現實版葛咸城芝加哥逐處睇！ | Follow Me to #Chicago #風城 #芝城 #CloudGate #TheBean #Batman #GothamCity	analyze	\N	IxQdeuDrrFM	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:51:34.131
79d3da10-2bae-4611-b129-52d4a6176b67	cmpzvydlg0000o17tqskqnik4	\N	PkfTmsUh3LE	\N	https://www.youtube.com/watch?v=PkfTmsUh3LE	Top 10 Must-See Attractions in Chicago | Ultimate Windy City Travel Guide	analyze	\N	PkfTmsUh3LE	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:51:35.328
fbd253cb-6eea-4733-9c19-8f3b983c5544	cmpzvydlg0000o17tqskqnik4	\N	IVsNGM_1ESU	\N	https://www.youtube.com/watch?v=IVsNGM_1ESU	Chicago Illinois Travel Guide: Best Things to Do In 2026	analyze	\N	IVsNGM_1ESU	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:51:36.542
401b8b25-eb86-4230-9162-d52c38f8916f	cmpzvydlg0000o17tqskqnik4	\N	JRU3m-vgyTo	\N	https://www.youtube.com/watch?v=JRU3m-vgyTo	(SUB)芝加哥自由行攻略｜ Chicago PLOG🇺🇸✈️｜木子雨云MuyuLalaland	analyze	\N	JRU3m-vgyTo	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:54:27.641
45e4cd87-b28e-4f9d-bc3d-903bc96c703a	cmpzvydlg0000o17tqskqnik4	\N	CeLbBSXG1Sw	\N	https://www.youtube.com/watch?v=CeLbBSXG1Sw	City Pass 全攻略！2024 芝加哥夏日景點 Vlog	analyze	\N	CeLbBSXG1Sw	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:54:28.95
39a64d2d-b58f-40ac-9f35-304282e78b0b	cmpzvydlg0000o17tqskqnik4	\N	5jZxZhY9YYk	\N	https://www.youtube.com/watch?v=5jZxZhY9YYk	【芝加哥馬拉松第二集】美國芝加哥 景點 美食攻略 千禧公園 芝加哥馬拉松 Chicago Marathon	analyze	\N	5jZxZhY9YYk	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:54:30.173
b6c612ea-0c97-4582-977f-d4e16f465782	cmpzvydlg0000o17tqskqnik4	\N	oIAmGEsi4S8	\N	https://www.youtube.com/watch?v=oIAmGEsi4S8	【芝加哥旅遊#2】芝加哥中國城，美食一條街 Chicago Chinatown	analyze	\N	oIAmGEsi4S8	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:54:31.426
fa6f8c55-ff5a-474a-8e3b-319d01ab7f81	cmpzvydlg0000o17tqskqnik4	\N	lYZMPeJ0kgY	\N	https://www.youtube.com/watch?v=lYZMPeJ0kgY	芝加哥最受歡迎的景點——帶你了解超級雕塑「雲門」以及公共藝術帶來的思考｜Chicago "Cloud Gate"	analyze	\N	lYZMPeJ0kgY	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:54:32.769
9c15c9a3-ce4b-4c52-8efd-9c846bd06ca6	cmpzvydlg0000o17tqskqnik4	\N	oF2UGEhBq50	\N	https://www.youtube.com/watch?v=oF2UGEhBq50	芝加哥旅遊攻略 | Chicago Travel Vlog | 全美第四高樓無敵夜景 | 海軍碼頭超刺激快艇 | 絕美河畔 | 芝加哥獨旅(上集)	analyze	\N	oF2UGEhBq50	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:54:34.082
c2dd2b09-e824-45bc-8afa-7bde14ca2af3	cmpzvydlg0000o17tqskqnik4	cmpzwsz0y00ampn84jk9wktky	JRU3m-vgyTo	youtube	https://www.youtube.com/watch?v=JRU3m-vgyTo	(SUB)芝加哥自由行攻略｜ Chicago PLOG🇺🇸✈️｜木子雨云MuyuLalaland	watch	\N	\N	\N	\N	null	null	null	2026-06-04 19:54:35.137
de6ab2cf-c0f5-4662-917a-fd8d8452ec5d	cmpzvydlg0000o17tqskqnik4	cmpzwsz0y00ampn84jk9wktky	CeLbBSXG1Sw	youtube	https://www.youtube.com/watch?v=CeLbBSXG1Sw	City Pass 全攻略！2024 芝加哥夏日景點 Vlog	watch	\N	\N	\N	\N	null	null	null	2026-06-04 19:54:36.086
a59ef261-48a0-4028-b7bf-8075f0a4926d	cmpzvydlg0000o17tqskqnik4	\N	JRU3m-vgyTo	\N	https://www.youtube.com/watch?v=JRU3m-vgyTo	(SUB)芝加哥自由行攻略｜ Chicago PLOG🇺🇸✈️｜木子雨云MuyuLalaland	analyze	\N	JRU3m-vgyTo	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:54:33.85
352f4aec-40c9-4e2e-9059-bf27a5494693	cmpzvydlg0000o17tqskqnik4	\N	CeLbBSXG1Sw	\N	https://www.youtube.com/watch?v=CeLbBSXG1Sw	City Pass 全攻略！2024 芝加哥夏日景點 Vlog	analyze	\N	CeLbBSXG1Sw	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:54:52.934
2c512e55-66ab-4ca5-89d1-8c9cdf998349	cmpzvydlg0000o17tqskqnik4	\N	5jZxZhY9YYk	\N	https://www.youtube.com/watch?v=5jZxZhY9YYk	【芝加哥馬拉松第二集】美國芝加哥 景點 美食攻略 千禧公園 芝加哥馬拉松 Chicago Marathon	analyze	\N	5jZxZhY9YYk	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:54:54.181
cfc6642b-822c-4116-a754-780dba87e395	cmpzvydlg0000o17tqskqnik4	\N	lYZMPeJ0kgY	\N	https://www.youtube.com/watch?v=lYZMPeJ0kgY	芝加哥最受歡迎的景點——帶你了解超級雕塑「雲門」以及公共藝術帶來的思考｜Chicago "Cloud Gate"	analyze	\N	lYZMPeJ0kgY	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:54:55.424
d8040343-d438-45fb-b0e2-44f80b992f69	cmpzvydlg0000o17tqskqnik4	\N	oF2UGEhBq50	\N	https://www.youtube.com/watch?v=oF2UGEhBq50	芝加哥旅遊攻略 | Chicago Travel Vlog | 全美第四高樓無敵夜景 | 海軍碼頭超刺激快艇 | 絕美河畔 | 芝加哥獨旅(上集)	analyze	\N	oF2UGEhBq50	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:54:56.714
52c91d7b-03c6-4f83-91a3-85517532b70b	cmpzvydlg0000o17tqskqnik4	cmpzwsz0y00ampn84jk9wktky	JRU3m-vgyTo	youtube	https://www.youtube.com/watch?v=JRU3m-vgyTo	(SUB)芝加哥自由行攻略｜ Chicago PLOG🇺🇸✈️｜木子雨云MuyuLalaland	watch	\N	\N	\N	\N	null	null	null	2026-06-04 19:56:14.175
823b4f6d-2a6a-413e-b0e0-08a236c98d5e	cmpzvydlg0000o17tqskqnik4	\N	JRU3m-vgyTo	\N	https://www.youtube.com/watch?v=JRU3m-vgyTo	(SUB)芝加哥自由行攻略｜ Chicago PLOG🇺🇸✈️｜木子雨云MuyuLalaland	analyze	\N	JRU3m-vgyTo	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:56:15.544
1d5e003c-473a-4137-a4c9-3a381d30074c	cmpzvydlg0000o17tqskqnik4	\N	JRU3m-vgyTo	\N	https://www.youtube.com/watch?v=JRU3m-vgyTo	(SUB)芝加哥自由行攻略｜ Chicago PLOG🇺🇸✈️｜木子雨云MuyuLalaland	analyze	\N	JRU3m-vgyTo	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:56:17.577
db43b32b-9085-4103-a9ca-7afbc8e1ad1a	cmpzvydlg0000o17tqskqnik4	cmpzwsz0y00ampn84jk9wktky	CeLbBSXG1Sw	youtube	https://www.youtube.com/watch?v=CeLbBSXG1Sw	City Pass 全攻略！2024 芝加哥夏日景點 Vlog	watch	\N	\N	\N	\N	null	null	null	2026-06-04 19:56:24.8
4807d512-dafb-42ed-8449-21977acc06b3	cmpzvydlg0000o17tqskqnik4	\N	CeLbBSXG1Sw	\N	https://www.youtube.com/watch?v=CeLbBSXG1Sw	City Pass 全攻略！2024 芝加哥夏日景點 Vlog	analyze	\N	CeLbBSXG1Sw	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:56:23.775
6a73d8a7-f938-4119-963d-f388901923ce	cmpzvydlg0000o17tqskqnik4	\N	CeLbBSXG1Sw	\N	https://www.youtube.com/watch?v=CeLbBSXG1Sw	City Pass 全攻略！2024 芝加哥夏日景點 Vlog	analyze	\N	CeLbBSXG1Sw	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:56:26.006
30d3dbfd-35dd-4d32-bbd4-67469f9fa8e1	cmpzvydlg0000o17tqskqnik4	\N	CeLbBSXG1Sw	\N	https://www.youtube.com/watch?v=CeLbBSXG1Sw	City Pass 全攻略！2024 芝加哥夏日景點 Vlog	analyze	\N	CeLbBSXG1Sw	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:54:37.464
b6f93c35-7a0b-4e52-8b4b-68a0f0c38054	cmpzvydlg0000o17tqskqnik4	\N	JRU3m-vgyTo	\N	https://www.youtube.com/watch?v=JRU3m-vgyTo	(SUB)芝加哥自由行攻略｜ Chicago PLOG🇺🇸✈️｜木子雨云MuyuLalaland	analyze	\N	JRU3m-vgyTo	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:54:50.457
359598fe-2cee-4730-bbb7-28a2832e5265	cmpzvydlg0000o17tqskqnik4	\N	oIAmGEsi4S8	\N	https://www.youtube.com/watch?v=oIAmGEsi4S8	【芝加哥旅遊#2】芝加哥中國城，美食一條街 Chicago Chinatown	analyze	\N	oIAmGEsi4S8	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:54:51.779
e9d3994a-a2c6-43b8-895f-afedc4710805	cmpzvydlg0000o17tqskqnik4	cmpzwsz0y00ampn84jk9wktky	JRU3m-vgyTo	youtube	https://www.youtube.com/watch?v=JRU3m-vgyTo	(SUB)芝加哥自由行攻略｜ Chicago PLOG🇺🇸✈️｜木子雨云MuyuLalaland	watch	\N	\N	\N	\N	null	null	null	2026-06-04 19:56:03.946
8345026d-3719-42d9-a987-1b54aa6f1b79	cmpzvydlg0000o17tqskqnik4	\N	JRU3m-vgyTo	\N	https://www.youtube.com/watch?v=JRU3m-vgyTo	(SUB)芝加哥自由行攻略｜ Chicago PLOG🇺🇸✈️｜木子雨云MuyuLalaland	analyze	\N	JRU3m-vgyTo	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:56:05.279
922fd0fa-ada5-4d70-9a6c-f3a4e8f73402	cmpzvydlg0000o17tqskqnik4	cmpzwsz0y00ampn84jk9wktky	oIAmGEsi4S8	youtube	https://www.youtube.com/watch?v=oIAmGEsi4S8	【芝加哥旅遊#2】芝加哥中國城，美食一條街 Chicago Chinatown	watch	\N	\N	\N	\N	null	null	null	2026-06-04 19:56:10.592
22161e0c-073f-4ae0-9ac4-2758f4b8f6c0	cmpzvydlg0000o17tqskqnik4	\N	oIAmGEsi4S8	\N	https://www.youtube.com/watch?v=oIAmGEsi4S8	【芝加哥旅遊#2】芝加哥中國城，美食一條街 Chicago Chinatown	analyze	\N	oIAmGEsi4S8	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:56:11.989
a2ede1a9-8359-4d84-bf3b-ac8ee9842b20	cmpzvydlg0000o17tqskqnik4	\N	DhGao1O6BgQ	\N	https://www.youtube.com/watch?v=DhGao1O6BgQ	【毛菓子頻道】不專業美食介紹之《嘉義-穀谷 GOOD．GOOD》EP7	analyze	\N	DhGao1O6BgQ	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:57:31.757
844d351e-0342-48e6-ad98-1f5b9fb39c50	cmpzvydlg0000o17tqskqnik4	\N	aG8srz7_tg8	\N	https://www.youtube.com/watch?v=aG8srz7_tg8	嘉義Chiayi vlog🚂 | 選物小店、穀谷、飲料喝不完、阿里山英迪格飯店	analyze	\N	aG8srz7_tg8	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-description-fallback"}	2026-06-04 19:57:33.517
a36c1600-16a7-4a97-bdc9-67f7aa69f966	cmpzvydlg0000o17tqskqnik4	\N	P6yhj20BLfM	\N	https://www.youtube.com/watch?v=P6yhj20BLfM	Vlog | Travel Vlog | 嘉義兩天一夜、小吃美食地圖、平價樓中樓住宿、不私藏的咖啡廳和景點推薦	analyze	\N	P6yhj20BLfM	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-04 19:57:34.674
b0ed135f-55f0-49f0-bf7b-387962f39f9d	cmpzvydlg0000o17tqskqnik4	\N	622NyferhiY	\N	https://www.youtube.com/watch?v=622NyferhiY	【嘉義美食#1】嘉義一日文青網美約會行程｜在地人從小吃到大的車輪餅｜老嘉義人吃的懂新網美店嗎?!【E家愛吃愛旅遊】	analyze	\N	622NyferhiY	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-description-fallback"}	2026-06-04 19:57:36.606
c7632624-e323-4e5c-bb94-6edbd04d823f	cmpzvydlg0000o17tqskqnik4	\N	8aBC_8wF0_E	\N	https://www.youtube.com/watch?v=8aBC_8wF0_E	嘉義兩天一夜！這個行程保證你吃到吐～遇見此生最愛的咖哩店！	analyze	\N	8aBC_8wF0_E	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-description-fallback"}	2026-06-04 19:57:38.183
1a7afb92-74b9-4e69-9195-82322c8ee4fd	cmpzvydlg0000o17tqskqnik4	\N	SDy_qKbqEmM	\N	https://www.youtube.com/watch?v=SDy_qKbqEmM	嘉義口袋美食公開！文青瘋朝聖老宅改造餐廳｜同學下課了EP.65｜U2M2	analyze	\N	SDy_qKbqEmM	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-description-fallback"}	2026-06-04 19:57:40.006
8bcb4336-6147-4788-904c-0a52407fb565	cmpzvydlg0000o17tqskqnik4	\N	YklfBsfIOGc	\N	https://www.youtube.com/watch?v=YklfBsfIOGc	(SUB)嘉義市區景點&美食🚂超豐盛自助早餐飯店🥨｜嘉義市立美術館｜蘭桂坊花園酒店｜台灣花磚博物館｜阿里山鐵路園區｜檜意森活村｜嘉義美食 嘉義小吃 嘉義住宿 嘉義景點｜木子雨云MuyuLalaland	analyze	\N	YklfBsfIOGc	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-05 09:40:32.361
34264e19-6a92-456b-b579-78fb5ee2985c	cmpzvydlg0000o17tqskqnik4	\N	rQ2oq3TmqVg	\N	https://www.youtube.com/watch?v=rQ2oq3TmqVg	嘉義一日遊｜嘉義最新景點！！｜台版迪士尼城堡🏰｜近距離與動物互動｜泡腳看夕陽好浪漫💕｜歐樂沃築夢城堡｜Chiayi Day Trip	analyze	\N	rQ2oq3TmqVg	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-05 09:40:34.294
f6abbdba-c645-45eb-a8b2-dc39ddd98e88	cmpzvydlg0000o17tqskqnik4	\N	LLePANQT-Uc	\N	https://www.youtube.com/watch?v=LLePANQT-Uc	【江江哥愛七淘】機車旅行｜2026嘉義竹崎金針花季｜竹崎花海一日遊全攻略！交通、私房美食、賞花祕境一次收錄｜嘉義美食｜嘉義景點｜嘉義旅遊 Taiwan travel🇹🇼	analyze	\N	LLePANQT-Uc	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-05 09:40:35.84
16c82f45-2cc6-4510-82a3-d5202eabe2d1	cmpzvydlg0000o17tqskqnik4	\N	GF2Pi-Chies	\N	https://www.youtube.com/watch?v=GF2Pi-Chies	【江江哥愛七淘】機車旅行｜嘉義必玩路線！太平雲梯＋嘉義美食＋秘境之旅一次收錄｜嘉義景點	analyze	\N	GF2Pi-Chies	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-05 09:40:37.577
be705b36-2f1d-4c0c-9c97-4e7392678433	cmpzvydlg0000o17tqskqnik4	\N	LMQn2YSRZUA	\N	https://www.youtube.com/watch?v=LMQn2YSRZUA	2025嘉義新景點｜1場時光旅行 7個必去新景點 穿越時空最喜歡的老宅茶館、老宅咖啡 老宅加寵物太療癒 魚塭旁的美國公路電影｜ft. Sony ZV-E10 II｜嘉義景點行程推薦	analyze	\N	LMQn2YSRZUA	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-05 09:40:39.724
55e16c18-6cff-4944-8a3d-a711ca713aa1	cmpzvydlg0000o17tqskqnik4	\N	T1sBFXXMZYw	\N	https://www.youtube.com/watch?v=T1sBFXXMZYw	嘉義太扯🔥最大瑪利歐主題園區曝光！阿里山主燈＋媽祖燈會一次逛，交通攻略與4大亮點｜2026台灣燈會｜三歲半	analyze	\N	T1sBFXXMZYw	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-05 09:40:41.547
12371b2c-8c3a-4159-bbed-5850c23de2f8	cmq2enhup0000p97rmqzrn9lp	\N	RDu4ub52LtE	\N	https://www.youtube.com/watch?v=RDu4ub52LtE	【🇳🇿紐西蘭旅遊Ep1】10日9夜北島自駕 // 奧克蘭出發～懷托摩螢火蟲洞穴（Waitomo Glowworm Caves）入住小木屋！～日出、銀河星空太美了	analyze	\N	RDu4ub52LtE	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-06 16:52:22.474
1f86e78b-3645-4120-ac3c-c0752a7659c7	cmq2enhup0000p97rmqzrn9lp	\N	L9n1X0TkeQs	\N	https://www.youtube.com/watch?v=L9n1X0TkeQs	【皇后鎮必玩景點】皇后鎮市區超好逛｜世上最好吃漢堡｜必玩斜坡滑車｜紐西蘭EP.3	analyze	\N	L9n1X0TkeQs	\N	\N	[]	[]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-06 16:52:23.83
750cfe5d-0378-4102-aec9-8860cac6f670	cmq2enhup0000p97rmqzrn9lp	\N	2zzm_mXAS_E	\N	https://www.youtube.com/watch?v=2zzm_mXAS_E	【🇳🇿紐西蘭旅遊Ep2】10日9夜自駕遊北島 ~ 胡卡瀑布｜陶波湖麥當勞、超美Taupo Airbnb｜Whakapapa 雪山上的Cafe｜WaiOTapu 地熱世界	analyze	\N	2zzm_mXAS_E	\N	\N	["胡卡瀑布", "陶波湖", "Mount Ruapehu", "Whakapapa", "Rotorua"]	[{"title": "胡卡瀑布", "timestamp": "0:59"}, {"title": "陶波湖", "timestamp": "1:28"}, {"title": "Mount Ruapehu", "timestamp": "7:35"}, {"title": "Whakapapa", "timestamp": "7:58"}, {"title": "Rotorua", "timestamp": "20:21"}]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-06 16:52:36.598
db951bc8-9073-4d6d-bc4b-2a064951411c	cmq2enhup0000p97rmqzrn9lp	\N	RDu4ub52LtE	youtube	https://www.youtube.com/watch?v=RDu4ub52LtE	【🇳🇿紐西蘭旅遊Ep1】10日9夜北島自駕 // 奧克蘭出發～懷托摩螢火蟲洞穴（Waitomo Glowworm Caves）入住小木屋！～日出、銀河星空太美了	watch	\N	\N	\N	\N	null	null	null	2026-06-06 16:52:38.054
c85b249c-d502-4ac0-9714-e2694ada09b0	cmq2enhup0000p97rmqzrn9lp	\N	p3EelyjdJfU	\N	https://www.youtube.com/watch?v=p3EelyjdJfU	【紐西蘭南島自由行】新西蘭自駕遊攻略🇳🇿 皇后鎮 基督城 酒店、景點、餐廳｜New Zealand Vlog 2026	analyze	\N	p3EelyjdJfU	\N	\N	["特卡波湖", "好牧羊人教堂", "皇后鎮", "基督城", "皇后鎮弗蘭克頓路假日酒店", "卡恩莫爾哈格利公園酒店"]	[{"title": "特卡波湖", "timestamp": "3:00"}, {"title": "好牧羊人教堂", "timestamp": "3:00"}, {"title": "皇后鎮", "timestamp": "8:00"}, {"title": "皇后鎮弗蘭克頓路假日酒店", "timestamp": "9:00"}, {"title": "基督城", "timestamp": "16:00"}, {"title": "卡恩莫爾哈格利公園酒店", "timestamp": "17:00"}]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-06 16:52:44.257
4d79a1fa-8454-4710-ae04-df43ac3f425b	cmq2enhup0000p97rmqzrn9lp	\N	RDu4ub52LtE	youtube	https://www.youtube.com/watch?v=RDu4ub52LtE	【🇳🇿紐西蘭旅遊Ep1】10日9夜北島自駕 // 奧克蘭出發～懷托摩螢火蟲洞穴（Waitomo Glowworm Caves）入住小木屋！～日出、銀河星空太美了	watch	\N	\N	\N	\N	null	null	null	2026-06-06 16:52:54.64
d558184b-f22f-4155-ac6c-2861100ec762	cmq2enhup0000p97rmqzrn9lp	\N	RDu4ub52LtE	youtube	https://www.youtube.com/watch?v=RDu4ub52LtE	【🇳🇿紐西蘭旅遊Ep1】10日9夜北島自駕 // 奧克蘭出發～懷托摩螢火蟲洞穴（Waitomo Glowworm Caves）入住小木屋！～日出、銀河星空太美了	watch	\N	\N	\N	\N	null	null	null	2026-06-06 16:53:21.819
26e78ab0-4110-4362-bdd2-aacf338b93ef	cmq2enhup0000p97rmqzrn9lp	\N	RDu4ub52LtE	youtube	https://www.youtube.com/watch?v=RDu4ub52LtE	【🇳🇿紐西蘭旅遊Ep1】10日9夜北島自駕 // 奧克蘭出發～懷托摩螢火蟲洞穴（Waitomo Glowworm Caves）入住小木屋！～日出、銀河星空太美了	watch	\N	\N	\N	\N	null	null	null	2026-06-06 16:53:56.279
bb5ed54e-57d0-4476-96fa-dcbbd5b23199	cmq2enhup0000p97rmqzrn9lp	\N	L9n1X0TkeQs	youtube	https://www.youtube.com/watch?v=L9n1X0TkeQs	【皇后鎮必玩景點】皇后鎮市區超好逛｜世上最好吃漢堡｜必玩斜坡滑車｜紐西蘭EP.3	watch	\N	\N	\N	\N	null	null	null	2026-06-06 16:53:57.675
8577c259-754f-4cb0-ba57-82fa4dab38e3	cmq2enhup0000p97rmqzrn9lp	\N	JPRRnAFhDfU	\N	https://www.youtube.com/watch?v=JPRRnAFhDfU	【紐西蘭自由行攻略行程懶人包】🇳🇿紐西蘭20個必玩旅遊景點｜紐西蘭美食｜紐西蘭18天露營車自駕花費大公開	analyze	\N	JPRRnAFhDfU	\N	\N	["Castle hill", "好牧羊人教堂", "約翰山天文台", "斜坡滑車", "Tekapo Springs", "格林諾奇魔界場景騎馬", "奧瑪魯歷史區", "阿卡羅阿羊駝牧場", "皇后鎮", "格林諾奇碼頭", "瓦納卡薰衣草農場", "格林諾奇騎馬", "Astro Cafe", "藍企鵝保育中心"]	[{"title": "格林諾奇魔界場景騎馬", "timestamp": "0:01"}, {"title": "奧瑪魯歷史區", "timestamp": "0:01"}, {"title": "藍企鵝保育中心", "timestamp": "0:01"}, {"title": "阿卡羅阿羊駝牧場", "timestamp": "0:01"}, {"title": "皇后鎮", "timestamp": "0:01"}, {"title": "格林諾奇碼頭", "timestamp": "0:01"}, {"title": "瓦納卡薰衣草農場", "timestamp": "0:01"}, {"title": "格林諾奇騎馬", "timestamp": "0:01"}]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-06 16:53:58.288
3094b4ef-8738-438c-b1b3-edb5172398c7	cmq2enhup0000p97rmqzrn9lp	\N	RDu4ub52LtE	youtube	https://www.youtube.com/watch?v=RDu4ub52LtE	【🇳🇿紐西蘭旅遊Ep1】10日9夜北島自駕 // 奧克蘭出發～懷托摩螢火蟲洞穴（Waitomo Glowworm Caves）入住小木屋！～日出、銀河星空太美了	watch	\N	\N	\N	\N	null	null	null	2026-06-06 16:53:58.87
d58c281b-8c38-425e-8cac-b2550b37be9e	cmq2enhup0000p97rmqzrn9lp	\N	MivGUH-15zw	\N	https://www.youtube.com/watch?v=MivGUH-15zw	紐西蘭自駕遊 | 小心！香港10年牌都中伏，一落地就硬食$150罰款！5大駕駛規矩／注意事項，遊客必睇！#紐西蘭旅行 #紐西蘭自由行 #紐西蘭 #紐西蘭旅遊貼士	analyze	\N	MivGUH-15zw	\N	\N	["奧克蘭", "紐市政府"]	[{"title": "奧克蘭", "timestamp": "2:16"}, {"title": "紐市政府", "timestamp": "3:28"}]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-06 16:54:13.121
aa4a4319-bb1a-4a6a-ab01-58e61dd8f96e	cmq2enhup0000p97rmqzrn9lp	\N	RDu4ub52LtE	\N	https://www.youtube.com/watch?v=RDu4ub52LtE	【🇳🇿紐西蘭旅遊Ep1】10日9夜北島自駕 // 奧克蘭出發～懷托摩螢火蟲洞穴（Waitomo Glowworm Caves）入住小木屋！～日出、銀河星空太美了	analyze	\N	RDu4ub52LtE	\N	\N	["Taupo", "奧克蘭", "漢密頓動物園", "漢密頓花園", "劍橋", "懷托摩螢火蟲洞穴", "Ruakuri Cave"]	[{"title": "奧克蘭", "timestamp": "0:57"}, {"title": "漢密頓動物園", "timestamp": "5:54"}, {"title": "漢密頓花園", "timestamp": "7:28"}, {"title": "劍橋", "timestamp": "9:31"}, {"title": "懷托摩螢火蟲洞穴", "timestamp": "11:00"}, {"title": "Ruakuri Cave", "timestamp": "11:39"}, {"title": "Taupo", "timestamp": "21:34"}]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-06 16:54:20.953
fa1438a5-a9ef-4c24-adf9-dadad34e5a8e	cmq2enhup0000p97rmqzrn9lp	\N	L9n1X0TkeQs	\N	https://www.youtube.com/watch?v=L9n1X0TkeQs	【皇后鎮必玩景點】皇后鎮市區超好逛｜世上最好吃漢堡｜必玩斜坡滑車｜紐西蘭EP.3	analyze	\N	L9n1X0TkeQs	\N	\N	["皇后鎮", "Skyline天空纜車", "Castle hill", "Fergburger", "哈威亞湖", "格林諾奇碼頭", "庫克山", "塔斯曼冰川", "瓦卡蒂普湖", "米爾福德峽灣"]	[{"title": "皇后鎮", "timestamp": "0:00"}, {"title": "Skyline天空纜車", "timestamp": "0:41"}, {"title": "Castle hill", "timestamp": "2:00"}, {"title": "瓦卡蒂普湖", "timestamp": "4:14"}, {"title": "Fergburger", "timestamp": "4:56"}, {"title": "哈威亞湖", "timestamp": "9:01"}, {"title": "米爾福德峽灣", "timestamp": "15:05"}, {"title": "格林諾奇碼頭", "timestamp": "16:00"}]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-06 16:54:38.517
655def31-cf87-468e-8e98-1bc574f43e69	cmq2enhup0000p97rmqzrn9lp	\N	RDu4ub52LtE	youtube	https://www.youtube.com/watch?v=RDu4ub52LtE	【🇳🇿紐西蘭旅遊Ep1】10日9夜北島自駕 // 奧克蘭出發～懷托摩螢火蟲洞穴（Waitomo Glowworm Caves）入住小木屋！～日出、銀河星空太美了	watch	\N	\N	\N	\N	null	null	null	2026-06-06 20:37:21.737
c2a40820-5e47-4bff-b6b1-74c9377956a8	cmq2enhup0000p97rmqzrn9lp	\N	RDu4ub52LtE	\N	https://www.youtube.com/watch?v=RDu4ub52LtE	【🇳🇿紐西蘭旅遊Ep1】10日9夜北島自駕 // 奧克蘭出發～懷托摩螢火蟲洞穴（Waitomo Glowworm Caves）入住小木屋！～日出、銀河星空太美了	analyze	\N	RDu4ub52LtE	\N	\N	["漢密頓動物園", "漢密頓花園", "劍橋", "懷托摩螢火蟲洞穴", "Ruakuri Cave", "Taupo"]	[{"title": "漢密頓動物園", "timestamp": "5:54"}, {"title": "漢密頓花園", "timestamp": "7:28"}, {"title": "劍橋", "timestamp": "9:31"}, {"title": "懷托摩螢火蟲洞穴", "timestamp": "11:00"}, {"title": "Ruakuri Cave", "timestamp": "11:39"}, {"title": "Taupo", "timestamp": "16:37"}]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-06 20:37:35.67
00931b66-0e49-4523-a24a-34b4868224fa	cmq2enhup0000p97rmqzrn9lp	\N	L9n1X0TkeQs	youtube	https://www.youtube.com/watch?v=L9n1X0TkeQs	【皇后鎮必玩景點】皇后鎮市區超好逛｜世上最好吃漢堡｜必玩斜坡滑車｜紐西蘭EP.3	watch	\N	\N	\N	\N	null	null	null	2026-06-06 20:37:45.129
1ce6fa73-8fff-43c6-82e8-8b5b40c49a06	cmq2enhup0000p97rmqzrn9lp	\N	L9n1X0TkeQs	\N	https://www.youtube.com/watch?v=L9n1X0TkeQs	【皇后鎮必玩景點】皇后鎮市區超好逛｜世上最好吃漢堡｜必玩斜坡滑車｜紐西蘭EP.3	analyze	\N	L9n1X0TkeQs	\N	\N	["Skyline天空纜車", "Castle hill", "Fergburger", "瓦卡蒂普湖", "哈威亞湖", "米爾福德峽灣", "格林諾奇碼頭", "庫克山", "塔斯曼冰川"]	[{"title": "Skyline天空纜車", "timestamp": "0:41"}, {"title": "Castle hill", "timestamp": "2:00"}, {"title": "瓦卡蒂普湖", "timestamp": "4:14"}, {"title": "Fergburger", "timestamp": "4:56"}, {"title": "哈威亞湖", "timestamp": "9:01"}, {"title": "米爾福德峽灣", "timestamp": "15:05"}, {"title": "格林諾奇碼頭", "timestamp": "16:00"}, {"title": "庫克山", "timestamp": "27:48"}]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-06 20:38:02.511
d1fa66ca-cb88-4f89-83a8-ac4d80f7a985	cmq2enhup0000p97rmqzrn9lp	\N	2zzm_mXAS_E	youtube	https://www.youtube.com/watch?v=2zzm_mXAS_E	【🇳🇿紐西蘭旅遊Ep2】10日9夜自駕遊北島 ~ 胡卡瀑布｜陶波湖麥當勞、超美Taupo Airbnb｜Whakapapa 雪山上的Cafe｜WaiOTapu 地熱世界	watch	\N	\N	\N	\N	null	null	null	2026-06-06 20:38:11.825
66b3d221-1d97-4ffa-95c9-487caf91136b	cmq2enhup0000p97rmqzrn9lp	\N	MivGUH-15zw	youtube	https://www.youtube.com/watch?v=MivGUH-15zw	紐西蘭自駕遊 | 小心！香港10年牌都中伏，一落地就硬食$150罰款！5大駕駛規矩／注意事項，遊客必睇！#紐西蘭旅行 #紐西蘭自由行 #紐西蘭 #紐西蘭旅遊貼士	watch	\N	\N	\N	\N	null	null	null	2026-06-06 20:38:16.726
1d58fd22-98b5-4250-9dda-b36b0ca06b86	cmq2enhup0000p97rmqzrn9lp	\N	2zzm_mXAS_E	\N	https://www.youtube.com/watch?v=2zzm_mXAS_E	【🇳🇿紐西蘭旅遊Ep2】10日9夜自駕遊北島 ~ 胡卡瀑布｜陶波湖麥當勞、超美Taupo Airbnb｜Whakapapa 雪山上的Cafe｜WaiOTapu 地熱世界	analyze	\N	2zzm_mXAS_E	\N	\N	["胡卡瀑布", "陶波湖", "Whakapapa", "Mount Ruapehu", "Rotorua"]	[{"title": "胡卡瀑布", "timestamp": "0:59"}, {"title": "陶波湖", "timestamp": "1:28"}, {"title": "Mount Ruapehu", "timestamp": "7:35"}, {"title": "Whakapapa", "timestamp": "7:58"}, {"title": "Rotorua", "timestamp": "20:21"}]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-06 20:38:21.257
9b1b6162-f3f2-4acc-a315-a1751e42d82e	cmq2enhup0000p97rmqzrn9lp	\N	JPRRnAFhDfU	youtube	https://www.youtube.com/watch?v=JPRRnAFhDfU	【紐西蘭自由行攻略行程懶人包】🇳🇿紐西蘭20個必玩旅遊景點｜紐西蘭美食｜紐西蘭18天露營車自駕花費大公開	watch	\N	\N	\N	\N	null	null	null	2026-06-06 20:38:52.416
8cd6722b-5f47-4d09-8dd9-0d06f74ca853	cmq2enhup0000p97rmqzrn9lp	\N	JPRRnAFhDfU	youtube	https://www.youtube.com/watch?v=JPRRnAFhDfU	【紐西蘭自由行攻略行程懶人包】🇳🇿紐西蘭20個必玩旅遊景點｜紐西蘭美食｜紐西蘭18天露營車自駕花費大公開	watch	\N	\N	\N	\N	null	null	null	2026-06-06 20:39:32.405
e9cb037f-7948-4125-bc00-33599d1bea14	cmq2enhup0000p97rmqzrn9lp	\N	JPRRnAFhDfU	\N	https://www.youtube.com/watch?v=JPRRnAFhDfU	【紐西蘭自由行攻略行程懶人包】🇳🇿紐西蘭20個必玩旅遊景點｜紐西蘭美食｜紐西蘭18天露營車自駕花費大公開	analyze	\N	JPRRnAFhDfU	\N	\N	["Castle hill", "好牧羊人教堂", "蒂卡波湖", "胡克峽谷步道", "塔斯曼冰川", "哈威亞湖", "皇后鎮天空纜車", "約翰山天文台", "斜坡滑車", "Tekapo Springs", "Astro Cafe", "約翰山大學天文台", "格林諾奇碼頭", "庫克山", "瓦納卡", "隱士飯店"]	[{"title": "Castle hill", "timestamp": "2:00"}, {"title": "胡克峽谷步道", "timestamp": "5:54"}, {"title": "塔斯曼冰川", "timestamp": "6:14"}, {"title": "蒂卡波湖", "timestamp": "6:46"}, {"title": "好牧羊人教堂", "timestamp": "7:13"}, {"title": "哈威亞湖", "timestamp": "9:01"}, {"title": "約翰山天文台", "timestamp": "10:30"}, {"title": "皇后鎮天空纜車", "timestamp": "11:03"}]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-06 20:39:57.187
dc440617-e0ca-4e36-8588-b41c78d8b006	cmq2enhup0000p97rmqzrn9lp	\N	p3EelyjdJfU	youtube	https://www.youtube.com/watch?v=p3EelyjdJfU	【紐西蘭南島自由行】新西蘭自駕遊攻略🇳🇿 皇后鎮 基督城 酒店、景點、餐廳｜New Zealand Vlog 2026	watch	\N	\N	\N	\N	null	null	null	2026-06-06 20:40:20.532
e8f8acb5-0b8e-4e2f-b77e-da167a878a38	cmq2enhup0000p97rmqzrn9lp	\N	2zzm_mXAS_E	youtube	https://www.youtube.com/watch?v=2zzm_mXAS_E	【🇳🇿紐西蘭旅遊Ep2】10日9夜自駕遊北島 ~ 胡卡瀑布｜陶波湖麥當勞、超美Taupo Airbnb｜Whakapapa 雪山上的Cafe｜WaiOTapu 地熱世界	watch	\N	\N	\N	\N	null	null	null	2026-06-06 20:40:24.29
461c9a3f-492b-4a45-aac0-8adef9019703	cmq2enhup0000p97rmqzrn9lp	\N	MivGUH-15zw	youtube	https://www.youtube.com/watch?v=MivGUH-15zw	紐西蘭自駕遊 | 小心！香港10年牌都中伏，一落地就硬食$150罰款！5大駕駛規矩／注意事項，遊客必睇！#紐西蘭旅行 #紐西蘭自由行 #紐西蘭 #紐西蘭旅遊貼士	watch	\N	\N	\N	\N	null	null	null	2026-06-06 20:40:27.611
0f33ff38-939b-44fe-8d4a-d9f01dd3760b	cmq2enhup0000p97rmqzrn9lp	\N	MivGUH-15zw	\N	https://www.youtube.com/watch?v=MivGUH-15zw	紐西蘭自駕遊 | 小心！香港10年牌都中伏，一落地就硬食$150罰款！5大駕駛規矩／注意事項，遊客必睇！#紐西蘭旅行 #紐西蘭自由行 #紐西蘭 #紐西蘭旅遊貼士	analyze	\N	MivGUH-15zw	\N	\N	["紐市政府"]	[{"title": "紐市政府", "timestamp": "3:28"}]	{"cacheStatus": "miss", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript"}	2026-06-06 20:40:37.723
e943c5e5-c2bd-44d1-8661-ca19351d01fe	cmq2enhup0000p97rmqzrn9lp	\N	MivGUH-15zw	youtube	https://www.youtube.com/watch?v=MivGUH-15zw	紐西蘭自駕遊 | 小心！香港10年牌都中伏，一落地就硬食$150罰款！5大駕駛規矩／注意事項，遊客必睇！#紐西蘭旅行 #紐西蘭自由行 #紐西蘭 #紐西蘭旅遊貼士	watch	\N	\N	\N	\N	null	null	null	2026-06-06 20:41:28.255
\.


--
-- Data for Name: video_summary_caches; Type: TABLE DATA; Schema: public; Owner: aiyo
--

COPY public.video_summary_caches (id, "videoId", result, "createdAt", "updatedAt") FROM stdin;
6510328f-0af6-426d-99de-8ccba11c8972	video-simple-ollama-v5:RDu4ub52LtE:zh-Hant	{"debug": {"cacheStatus": "miss", "captionKind": "manual", "captionSource": "youtube-transcript-package", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript", "finalFoodCount": 2, "captionLanguage": "zh", "finalPlaceCount": 6, "pipelineVersion": "video-simple-ollama-v5", "failedChunkCount": 0, "transcriptSource": "youtube"}, "title": "【🇳🇿紐西蘭旅遊Ep1】10日9夜北島自駕 // 奧克蘭出發～懷托摩螢火蟲洞穴（Waitomo Glowworm Caves）入住小木屋！～日出、銀河星空太美了", "video": {"id": "youtube_RDu4ub52LtE", "url": "https://www.youtube.com/watch?v=RDu4ub52LtE", "title": "【🇳🇿紐西蘭旅遊Ep1】10日9夜北島自駕 // 奧克蘭出發～懷托摩螢火蟲洞穴（Waitomo Glowworm Caves）入住小木屋！～日出、銀河星空太美了", "source": "youtube-data-api", "summary": "影片提到漢密頓動物園、漢密頓花園、劍橋等地點，以及Depot Eatery, Auckland、Smoke Collective Barbecue, Cambridge等食物。", "videoId": "RDu4ub52LtE", "duration": "22:35", "thumbnail": "https://i.ytimg.com/vi/RDu4ub52LtE/hqdefault.jpg", "timestamps": [{"time": "5:54", "label": "漢密頓動物園"}, {"time": "7:28", "label": "漢密頓花園"}, {"time": "9:31", "label": "劍橋"}, {"time": "11:00", "label": "懷托摩螢火蟲洞穴"}, {"time": "11:39", "label": "Ruakuri Cave"}, {"time": "16:37", "label": "Taupo"}], "description": "📍紐西蘭北島 New Zealand North Island\\n因為早已計劃明年會到紐西蘭南島（South Island）探朋友，這次突如其來的紐西蘭之旅就決定先去探索紐西蘭北島（North Island）吧～ \\n\\n\\n旅行日期2024年7月\\nTravel Date: 2024.07\\n\\n\\n10天9夜的北島自駕遊，我們會由奧克蘭出發～經漢密頓（Hamilton)、劍橋（Cambridge）到懷托摩螢火蟲洞穴（Waitimo Glowworm Caves）；再到陶波湖（Taupo）待3天2夜入住一間超美的Airbnb；然後繞到 羅托路亞（Rotorua）玩3天最後才返回奧克蘭。\\n\\n影片應該會分為3 Parts，這次先看看我們由香港出發一路到 Waitomo的旅行Vlog吧～\\n\\n紐西蘭10日9夜行程：\\n0:00 紐西蘭北島自駕遊\\n0:58 香港飛奧克蘭\\n03:00 奧克蘭市中心\\n04:00 Depot Eatery, Auckland\\n06:00 漢密頓動物園 Hamilton Zoo\\n08:30 漢密頓花園 Hamilton Gardens\\n09:30 劍橋市\\n11:40 懷托摩螢火蟲洞穴 Waitimo Glowworm Caves\\n14:45 Ruakuri Cave 徒步參觀螢火蟲洞穴\\n18:45 懷托摩小木屋 Te Tiro Accommodation \\n19:20 日出．雲海．星空．銀河\\n\\n新西蘭詳細行程可以參考看看我們的We4 遊記：\\nhttps://we4-travel.com/nz-north-island/\\n\\n=========================\\n\\n📌紐西蘭北島景點：\\n漢密頓動物園 Hamilton Zoo\\nGoogle Map：https://maps.app.goo.gl/PWtRb8dTLcx8eAzR8\\n\\n漢密頓花園 Hamilton Gardens\\nGoogle Map：https://maps.app.goo.gl/DbfBSJdCdEyEZdWb6\\n\\n懷托摩螢火蟲洞穴 Waitimo Glowworm Caves\\nGoogle Map：https://maps.app.goo.gl/yAbZSrhnzkn5jafi9\\n\\nRuakuri Cave（Highly Recommend!!)\\nGoogle Map：https://maps.app.goo.gl/Nx4sjNSoj3hkqMHG9\\n\\n📌紐西蘭北島美食推薦：\\nDepot Eatery, Auckland\\nGoogle Map：https://maps.app.goo.gl/aCvS45ijZezDxdPt6\\n\\nSmoke Collective Barbecue, Cambridge\\nGoogle Map：https://maps.app.goo.gl/RNy5sBqpTH9ZFTAy9\\n\\n📌紐西蘭北島住宿推薦：\\nFour Points By Sheraton Auckland\\nGoogle Map：https://maps.app.goo.gl/BsT4meYgQTJdqUgD6\\n\\nHidden Lake Hotel and Apartments\\nGoogle Map：https://maps.app.goo.gl/DPHsHNRU4iS7ZApQ6\\n\\nTe Tiro Accommodation\\nGoogle Map：https://maps.app.goo.gl/vznjL46pb681m8Lf8\\n\\n========================\\n\\n影片中沒有旁白，只有輕鬆音樂。以第一人稱視角，和我們一起旅遊吧！\\n\\nWe do not narrate our videos, there will just be relaxing, soothing music. \\nImagine you are travelling with us. Sit back, grab a tea, and start travel. \\n\\n=========================\\n🛎Follow us on Instagram： http://instagram.com/voyagertt\\n🖥We4 Travel Blog：https://we4-travel.com\\n📬Job Inquires 合作查詢： we4travel2020@gmail.com\\n\\n=========================\\n\\n香港旅遊 - 推薦景點大合集👇🏼\\nhttps://youtube.com/playlist?list=PLWOVWh6kTWvN0JDqNvfmcVp0vXjhcwC1A\\n\\n日本旅遊（北海道｜東京河口湖｜京都琵琶湖｜飛驒高山｜沖繩） 👇🏼\\nhttps://youtube.com/playlist?list=PLWOVWh6kTWvNiEd7bKXoHyWmP9w5zsnb8\\n\\n如果喜歡影片記得Subscribe 我哋Channel，再Like & Share出去俾更多人睇啦（大感謝）😘\\nFeel Free to like and subscribe our channel for the latest travel tips in Hong Kong\\n\\n旅遊影片每星期更新！下集見❤️\\nTravel Videos update weekly! Stay Tune❤️\\n\\n============================\\n\\nCopyright WE4 TRAVEL© 2024. All Rights Reserved.All the video materials (except music) on this channel are original and recorded by We4Travel on location. Any copy, reproduction or republication of all or part of this video/audio is prohibited. \\n\\n==========================", "publishedAt": "2024-10-12T16:00:23Z", "channelTitle": "WE4 Travel 旅遊日常", "extractedFoods": ["Depot Eatery, Auckland", "Smoke Collective Barbecue, Cambridge"], "summarySegments": [{"id": "simple_segment_1", "text": "今天的第一站是漢密爾頓動物園（Hamilton Zoo", "foods": [], "title": "漢密頓動物園", "summary": "今天的第一站是漢密爾頓動物園（Hamilton Zoo", "timestamp": "5:54", "endSeconds": 384, "startLabel": "5:54", "startSeconds": 354, "locationHints": ["漢密頓動物園"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_2", "text": "漢密爾頓花園～車程大約20分鐘，有18個不同主題的花園", "foods": [], "title": "漢密頓花園", "summary": "漢密爾頓花園～車程大約20分鐘，有18個不同主題的花園", "timestamp": "7:28", "endSeconds": 478, "startLabel": "7:28", "startSeconds": 448, "locationHints": ["漢密頓花園"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_3", "text": "晚上會住宿在距離漢密頓20分鐘車程的劍橋鎮", "foods": ["Smoke Collective Barbecue, Cambridge"], "title": "劍橋", "summary": "晚上會住宿在距離漢密頓20分鐘車程的劍橋鎮", "timestamp": "9:31", "endSeconds": 601, "startLabel": "9:31", "startSeconds": 571, "locationHints": ["劍橋"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_4", "text": "一早出發前往紐西蘭北島必到的「懷托摩螢火蟲洞", "foods": ["Smoke Collective Barbecue, Cambridge"], "title": "懷托摩螢火蟲洞穴", "summary": "一早出發前往紐西蘭北島必到的「懷托摩螢火蟲洞", "timestamp": "11:00", "endSeconds": 690, "startLabel": "11:00", "startSeconds": 660, "locationHints": ["懷托摩螢火蟲洞穴"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_5", "text": "參觀時長45分鐘，會先欣賞鐘乳石再坐船看螢火蟲，後面的行程期待後面的行程啦～", "foods": ["Smoke Collective Barbecue, Cambridge"], "title": "Ruakuri Cave", "summary": "參觀時長45分鐘，會先欣賞鐘乳石再坐船看螢火蟲，後面的行程期待後面的行程啦～", "timestamp": "11:39", "endSeconds": 729, "startLabel": "11:39", "startSeconds": 699, "locationHints": ["Ruakuri Cave"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_6", "text": "繼續往Waitomo的山上走，晚上預訂了小木屋入住一晚，下一個城市 Taupō 前進", "foods": [], "title": "Taupo", "summary": "繼續往Waitomo的山上走，晚上預訂了小木屋入住一晚，下一個城市 Taupō 前進", "timestamp": "16:37", "endSeconds": 1027, "startLabel": "16:37", "startSeconds": 997, "locationHints": ["Taupo"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}], "extractedLocations": [{"lat": -37.7743253, "lng": 175.2168829, "raw": "漢密頓動物園", "name": "漢密頓動物園", "address": "183 Brymer Road, Rotokauri, Hamilton 3289紐西蘭", "placeId": "ChIJF1oU9LgjbW0RbEEJ6DXJPrA", "rawQuery": "漢密頓動物園", "verified": true, "confidence": 0.7135999999999999, "normalized": "漢密頓動物園", "rawMention": "漢密頓動物園", "cleanedName": "漢密頓動物園", "description": "今天的第一站是漢密爾頓動物園（Hamilton Zoo", "resolvedFrom": "google-place-details", "normalizedName": "漢密頓動物園", "extractionSource": "ai-polished"}, {"lat": -37.8057423, "lng": 175.3048807, "raw": "漢密頓花園", "name": "漢密頓花園", "address": "Hungerford Crescent, Hamilton East, Hamilton 3216紐西蘭", "placeId": "ChIJo1gsfikfbW0RgCudJGLvAA8", "rawQuery": "漢密頓花園", "verified": true, "confidence": 0.7135999999999999, "normalized": "漢密頓花園", "rawMention": "漢密頓花園", "cleanedName": "漢密頓花園", "description": "漢密爾頓花園～車程大約20分鐘，有18個不同主題的花園", "resolvedFrom": "google-place-details", "normalizedName": "漢密頓花園", "extractionSource": "ai-polished"}, {"lat": -37.8891864, "lng": 175.466267, "raw": "劍橋", "name": "劍橋", "address": "Cambridge, 紐西蘭", "placeId": "ChIJzUWRYnj9bG0R0LmiQ2HvAAU", "rawQuery": "劍橋", "verified": true, "confidence": 0.55, "normalized": "劍橋", "rawMention": "劍橋", "cleanedName": "劍橋", "description": "晚上會住宿在距離漢密頓20分鐘車程的劍橋鎮", "resolvedFrom": "google-place-details", "normalizedName": "劍橋", "extractionSource": "ai-polished"}, {"lat": -38.26070139999999, "lng": 175.1036062, "raw": "懷托摩螢火蟲洞穴", "name": "懷托摩螢火蟲洞穴", "address": "39 Waitomo Village Road, Waitomo Caves 3977紐西蘭", "placeId": "ChIJfVTj8363bG0R8p8w_eGxLJI", "rawQuery": "懷托摩螢火蟲洞穴", "verified": true, "confidence": 0.7135999999999999, "normalized": "懷托摩螢火蟲洞穴", "rawMention": "懷托摩螢火蟲洞穴", "cleanedName": "懷托摩螢火蟲洞穴", "description": "一早出發前往紐西蘭北島必到的「懷托摩螢火蟲洞", "resolvedFrom": "google-geocode", "normalizedName": "懷托摩螢火蟲洞穴", "extractionSource": "ai-polished"}, {"lat": -38.2641278, "lng": 175.0009997, "raw": "Ruakuri Cave", "name": "Ruakuri Cave", "address": "Ruakuri Mağarası, Waitomo Caves 3988紐西蘭", "placeId": "ChIJhVQ8wUe0bG0RJh41Quc7yeE", "rawQuery": "Ruakuri Cave", "verified": true, "confidence": 0.8202666666666666, "normalized": "Ruakuri Cave", "rawMention": "Ruakuri Cave", "cleanedName": "Ruakuri Cave", "description": "參觀時長45分鐘，會先欣賞鐘乳石再坐船看螢火蟲，後面的行程期待後面的行程啦～", "resolvedFrom": "google-geocode", "normalizedName": "Ruakuri Cave", "extractionSource": "ai-polished"}, {"lat": -38.6842862, "lng": 176.0704465, "raw": "Taupo", "name": "Taupo", "address": "紐西蘭陶波", "placeId": "ChIJWxZLFHfva20R4AmjQ2HvAAU", "rawQuery": "Taupo", "verified": true, "confidence": 0.55, "normalized": "Taupo", "rawMention": "Taupo", "cleanedName": "Taupo", "description": "繼續往Waitomo的山上走，晚上預訂了小木屋入住一晚，下一個城市 Taupō 前進", "resolvedFrom": "google-place-details", "normalizedName": "Taupo", "extractionSource": "ai-polished"}]}, "source": "youtube-summary-service", "summary": "影片提到漢密頓動物園、漢密頓花園、劍橋等地點，以及Depot Eatery, Auckland、Smoke Collective Barbecue, Cambridge等食物。", "segments": [{"id": "simple_segment_1", "text": "今天的第一站是漢密爾頓動物園（Hamilton Zoo", "foods": [], "title": "漢密頓動物園", "summary": "今天的第一站是漢密爾頓動物園（Hamilton Zoo", "timestamp": "5:54", "endSeconds": 384, "startLabel": "5:54", "startSeconds": 354, "locationHints": ["漢密頓動物園"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_2", "text": "漢密爾頓花園～車程大約20分鐘，有18個不同主題的花園", "foods": [], "title": "漢密頓花園", "summary": "漢密爾頓花園～車程大約20分鐘，有18個不同主題的花園", "timestamp": "7:28", "endSeconds": 478, "startLabel": "7:28", "startSeconds": 448, "locationHints": ["漢密頓花園"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_3", "text": "晚上會住宿在距離漢密頓20分鐘車程的劍橋鎮", "foods": ["Smoke Collective Barbecue, Cambridge"], "title": "劍橋", "summary": "晚上會住宿在距離漢密頓20分鐘車程的劍橋鎮", "timestamp": "9:31", "endSeconds": 601, "startLabel": "9:31", "startSeconds": 571, "locationHints": ["劍橋"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_4", "text": "一早出發前往紐西蘭北島必到的「懷托摩螢火蟲洞", "foods": ["Smoke Collective Barbecue, Cambridge"], "title": "懷托摩螢火蟲洞穴", "summary": "一早出發前往紐西蘭北島必到的「懷托摩螢火蟲洞", "timestamp": "11:00", "endSeconds": 690, "startLabel": "11:00", "startSeconds": 660, "locationHints": ["懷托摩螢火蟲洞穴"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_5", "text": "參觀時長45分鐘，會先欣賞鐘乳石再坐船看螢火蟲，後面的行程期待後面的行程啦～", "foods": ["Smoke Collective Barbecue, Cambridge"], "title": "Ruakuri Cave", "summary": "參觀時長45分鐘，會先欣賞鐘乳石再坐船看螢火蟲，後面的行程期待後面的行程啦～", "timestamp": "11:39", "endSeconds": 729, "startLabel": "11:39", "startSeconds": 699, "locationHints": ["Ruakuri Cave"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_6", "text": "繼續往Waitomo的山上走，晚上預訂了小木屋入住一晚，下一個城市 Taupō 前進", "foods": [], "title": "Taupo", "summary": "繼續往Waitomo的山上走，晚上預訂了小木屋入住一晚，下一個城市 Taupō 前進", "timestamp": "16:37", "endSeconds": 1027, "startLabel": "16:37", "startSeconds": 997, "locationHints": ["Taupo"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}], "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript", "extractedFoods": ["Depot Eatery, Auckland", "Smoke Collective Barbecue, Cambridge"], "mapsProvenance": "mixed", "transcriptSource": "youtube", "extractedLocations": ["漢密頓動物園", "漢密頓花園", "劍橋", "懷托摩螢火蟲洞穴", "Ruakuri Cave", "Taupo"]}	2026-06-06 20:37:35.666	2026-06-06 20:37:35.666
0b6ff685-96ae-4ee4-b2da-9bbdbfdff9e8	video-simple-ollama-v5:L9n1X0TkeQs:zh-Hant	{"debug": {"cacheStatus": "miss", "captionKind": "manual", "captionSource": "youtube-transcript-package", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript", "finalFoodCount": 4, "captionLanguage": "zh-TW", "finalPlaceCount": 9, "pipelineVersion": "video-simple-ollama-v5", "failedChunkCount": 0, "transcriptSource": "youtube"}, "title": "【皇后鎮必玩景點】皇后鎮市區超好逛｜世上最好吃漢堡｜必玩斜坡滑車｜紐西蘭EP.3", "video": {"id": "youtube_L9n1X0TkeQs", "url": "https://www.youtube.com/watch?v=L9n1X0TkeQs", "title": "【皇后鎮必玩景點】皇后鎮市區超好逛｜世上最好吃漢堡｜必玩斜坡滑車｜紐西蘭EP.3", "source": "youtube-data-api", "summary": "影片提到Skyline天空纜車、Castle hill、Fergburger等地點，以及Fergburger、班尼迪克蛋、漢堡等食物。", "videoId": "L9n1X0TkeQs", "duration": "17:45", "thumbnail": "https://i.ytimg.com/vi/L9n1X0TkeQs/hqdefault.jpg", "timestamps": [{"time": "0:41", "label": "Skyline天空纜車"}, {"time": "2:00", "label": "Castle hill"}, {"time": "4:14", "label": "瓦卡蒂普湖"}, {"time": "4:56", "label": "Fergburger"}, {"time": "9:01", "label": "哈威亞湖"}, {"time": "15:05", "label": "米爾福德峽灣"}, {"time": "16:00", "label": "格林諾奇碼頭"}, {"time": "27:48", "label": "庫克山"}], "description": "#紐西蘭旅遊景點  #紐西蘭美食 #皇后鎮\\n\\n🚁紐西蘭20個必玩旅遊景點：\\n📍Castle hill📍好牧羊人教堂📍約翰山天文台📍Tekapo springs 📍普卡基湖\\n📍胡克峽谷步道 📍塔斯曼冰川📍孤獨樹📍哈威亞湖📍瓦納卡薰衣草農場\\n📍皇后鎮天空纜車📍斜坡滑車📍Fergburger📍Deer Park Heights\\n📍米爾福德峽灣📍格林諾奇碼頭 📍格林諾奇魔界場景騎馬📍奧瑪魯歷史區 \\n📍藍企鵝保育中心📍阿卡羅阿羊駝牧場 📍玩跳傘或飛行傘\\n————————————————————\\n🚁紐西蘭實用連結：\\n📍房車國度租露營車網站：https://lurl.cc/yEdUbK\\n📍Campermate訂露營車營位網站：https://campermate.com/en\\n📍紐西蘭天氣查詢：https://www.metservice.com/\\n📍Deer Park Heights預定：https://deerparkheights.co.nz/visiting/\\n————————————————————\\n🏡紐西蘭住宿推薦優惠訂房連結：\\n📍 隱士飯店(庫克山飯店首選)：https://reurl.cc/Nl2ZMk \\n📍瓦納卡溫德姆俱樂部飯店(瓦納卡新飯店)：https://reurl.cc/E6mZka\\n📍 Lakes Edge Holiday Park(蒂卡波湖露營區首選)：https://reurl.cc/Ll27O4\\n📍 Grand Suites Lake Tekapo (蒂卡波湖高級飯店)：https://reurl.cc/g6rzAQ\\n📍皇后鎮湖岸盛橡度假飯店(皇后鎮首選)：https://reurl.cc/6dGDA5\\n📍Poshtel(奧瑪魯高CP值)：https://reurl.cc/8XeWlb\\n📍Haka House Christchurch(基督城市區)：https://reurl.cc/bYdk56\\n📍梅菲爾飯店(基督城市中心、頂級五星)：https://reurl.cc/WNbkLk\\n————————————————————\\n紐西蘭18天露營車之旅影片：\\n🚁總整理【紐西蘭自由行攻略行程懶人包】：https://youtu.be/JPRRnAFhDfU\\n🚁EP1【納尼亞巨石、蒂卡波湖觀星】：https://youtu.be/EplADeQo9gM\\n🚁EP2【庫克山直升機冰川探險】：https://youtu.be/4zJ1leCEJmo\\n🚁EP3【皇后鎮冒險、市區超好吃超好逛】：https://youtu.be/L9n1X0TkeQs\\n🚁EP4【世界第八大奇蹟、魔戒場景騎馬】：https://youtu.be/WEztBnK4OZs\\n🚁EP5【尋找世上最小藍企鵝、擁抱可愛羊駝】：https://youtu.be/xUWD2EBKHF4\\n————————————————————\\n🚁紐西蘭必玩旅遊景點優惠門票：\\n-KLOOK\\n📍約翰山天文台觀星：https://lurl.cc/WyzGHk\\n📍紐西蘭冰川直升機健行：https://lurl.cc/CgRqNf\\n📍皇后鎮高空跳傘：https://lurl.cc/qwUz1Y\\n📍米爾福德峽灣一日遊：https://lurl.cc/KrZFO7\\n📍阿卡羅阿莎瑪拉羊駝牧場之旅：https://lurl.cc/7zsunb\\n📍紐西蘭皇后鎮溫泉體驗：https://lurl.cc/VOHW81\\n📍TSS恩斯羅號蒸汽船至瓦爾特峰：https://lurl.cc/iDo4cD\\n📍蒂阿瑙螢火蟲洞之旅：https://lurl.cc/BV2NPU\\n📍全球租車(可異地還車)：https://reurl.cc/nDQbZ2\\n📍首次購票透過我的連結註冊，可獲得NT$100優惠回饋\\n👉https://reurl.cc/QX0zDZ\\n\\n-KKDAY\\n📍蒂卡波暗夜保護區觀星導覽：https://lurl.cc/Z8YZ8G\\n📍紐西蘭冰川直升機健行：https://lurl.cc/1AyYBM\\n📍皇后鎮高空跳傘：https://lurl.cc/HXyGde\\n📍紐西蘭皇后鎮溫泉體驗：https://lurl.cc/5lvByj\\n📍米爾福德峽灣一日遊：https://lurl.cc/FnNrk2\\n📍皇后鎮天空纜車＆滑板車：https://lurl.cc/i2TKC9\\n📍蒂阿瑙螢火蟲洞之旅：https://lurl.cc/UPLPti\\n📍首次購票透過我的連結註冊，可獲得NT$100優惠回饋\\n👉https://reurl.cc/nLj8kn\\n————————————————————\\n✈紐西蘭機票比價： https://skyscanner.pxf.io/rQJBNG\\n📱紐西蘭網路SIM卡(一定要買有送通話的很重要)：\\n📍紐西蘭4G上網通話SIM卡（台灣宅配到府）：https://lurl.cc/qbFxRq\\n📍紐西蘭40G上網+通話eSIM：https://lurl.cc/UKu9dk\\n————————————————————\\n🔗里歐愛旅遊部落格詳細圖文：https://leolovetravel.com\\n✨ IG：leolovetravel FB：里歐愛旅遊\\n————————————————————", "publishedAt": "2024-10-18T13:48:21Z", "channelTitle": "里歐愛旅遊 leolovetravel", "extractedFoods": ["Fergburger", "班尼迪克蛋", "漢堡", "麥盧卡蜂蜜"], "summarySegments": [{"id": "simple_segment_1", "text": "這個纜車是南半球最陡的纜車，坐上纜車可以到皇后鎮的最高峰 450公尺高的包伯峰上面俯瞰整個皇后鎮 還有瓦卡蒂普湖", "foods": [], "title": "Skyline天空纜車", "summary": "這個纜車是南半球最陡的纜車，坐上纜車可以到皇后鎮的最高峰 450公尺高的包伯峰上面俯瞰整個皇后鎮 還有瓦卡蒂普湖", "timestamp": "0:41", "endSeconds": 71, "startLabel": "0:41", "startSeconds": 41, "locationHints": ["Skyline天空纜車"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_2", "text": "我們選擇玩3次的斜坡滑車 Castle hill", "foods": [], "title": "Castle hill", "summary": "我們選擇玩3次的斜坡滑車 Castle hill", "timestamp": "2:00", "endSeconds": 150, "startLabel": "2:00", "startSeconds": 120, "locationHints": ["Castle hill"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_3", "text": "這邊一邊看風景一邊吃東西 也是很棒的體驗，如果有買包含午晚餐的方案 也可以坐在景觀餐廳 邊吃飯邊看風景哦", "foods": ["Fergburger"], "title": "瓦卡蒂普湖", "summary": "這邊一邊看風景一邊吃東西 也是很棒的體驗，如果有買包含午晚餐的方案 也可以坐在景觀餐廳 邊吃飯邊看風景哦", "timestamp": "4:14", "endSeconds": 284, "startLabel": "4:14", "startSeconds": 254, "locationHints": ["瓦卡蒂普湖"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_4", "text": "這個店是被CNN評比為世界第一的漢堡店 Fergburger", "foods": ["Fergburger"], "title": "Fergburger", "summary": "這個店是被CNN評比為世界第一的漢堡店 Fergburger", "timestamp": "4:56", "endSeconds": 326, "startLabel": "4:56", "startSeconds": 296, "locationHints": ["Fergburger"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_5", "text": "我們要開進Deer Park之前，它會有一個把我們擋住的欄桿，後面就是哈威亞湖", "foods": [], "title": "哈威亞湖", "summary": "我們要開進Deer Park之前，它會有一個把我們擋住的欄桿，後面就是哈威亞湖", "timestamp": "9:01", "endSeconds": 571, "startLabel": "9:01", "startSeconds": 541, "locationHints": ["哈威亞湖"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_6", "text": "我們現在在皇后鎮這邊的商場他百貨公司裡這間Giorgio Armani 好像是這個東西吧 黑曜石精華水，米爾福德峽灣", "foods": ["麥盧卡蜂蜜"], "title": "米爾福德峽灣", "summary": "我們現在在皇后鎮這邊的商場他百貨公司裡這間Giorgio Armani 好像是這個東西吧 黑曜石精華水，米爾福德峽灣", "timestamp": "15:05", "endSeconds": 935, "startLabel": "15:05", "startSeconds": 905, "locationHints": ["米爾福德峽灣"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_7", "text": "逛累了，根據地點描述，這邊還有一個超大的Lounge 可以在這邊休息 很舒服的一間百貨 超讚的", "foods": ["麥盧卡蜂蜜"], "title": "格林諾奇碼頭", "summary": "逛累了，根據地點描述，這邊還有一個超大的Lounge 可以在這邊休息 很舒服的一間百貨 超讚的", "timestamp": "16:00", "endSeconds": 990, "startLabel": "16:00", "startSeconds": 960, "locationHints": ["格林諾奇碼頭"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_8", "text": "上一集我們紐西蘭之旅到了 紐西蘭的最高峰庫克山", "foods": [], "title": "庫克山", "summary": "上一集我們紐西蘭之旅到了 紐西蘭的最高峰庫克山", "timestamp": "27:48", "endSeconds": 1698, "startLabel": "27:48", "startSeconds": 1668, "locationHints": ["庫克山"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}], "extractedLocations": [{"lat": -45.0284542, "lng": 168.656109, "raw": "Skyline天空纜車", "name": "Skyline天空纜車", "address": "53 Brecon Street, Queenstown 9300紐西蘭", "placeId": "ChIJqSoMFgAd1akRcBJGZxOV8lY", "rawQuery": "Skyline天空纜車", "verified": true, "confidence": 0.7459076923076923, "normalized": "Skyline天空纜車", "rawMention": "Skyline天空纜車", "cleanedName": "Skyline天空纜車", "description": "這個纜車是南半球最陡的纜車，坐上纜車可以到皇后鎮的最高峰 450公尺高的包伯峰上面俯瞰整個皇后鎮 還有瓦卡蒂普湖", "resolvedFrom": "google-geocode", "normalizedName": "Skyline天空纜車", "extractionSource": "ai-polished"}, {"lat": -43.21871910000001, "lng": 171.7163086, "raw": "Castle hill", "name": "Castle hill", "address": "Castle Hill, New Zealand, Castle Hill 7580紐西蘭", "placeId": "ChIJfQnf8l5oLm0RWMRqnWCZ4ok", "rawQuery": "Castle hill", "verified": true, "confidence": 1.0072756756756756, "normalized": "Castle hill", "rawMention": "Castle hill", "cleanedName": "Castle hill", "description": "我們選擇玩3次的斜坡滑車 Castle hill", "resolvedFrom": "google-place-details", "normalizedName": "Castle hill", "extractionSource": "ai-polished"}, {"lat": -45.0317349, "lng": 168.6594775, "raw": "Fergburger", "name": "Fergburger", "address": "42 Shotover Street, Queenstown 9300紐西蘭", "placeId": "ChIJXVWEZYEd1akRH6jepbQaihc", "rawQuery": "Fergburger", "verified": true, "confidence": 0.7517818181818181, "normalized": "Fergburger", "rawMention": "Fergburger", "cleanedName": "Fergburger", "description": "這個店是被CNN評比為世界第一的漢堡店 Fergburger", "resolvedFrom": "google-geocode", "normalizedName": "Fergburger", "extractionSource": "ai-polished"}, {"lat": -45.0894473, "lng": 168.5352044, "raw": "瓦卡蒂普湖", "name": "瓦卡蒂普湖", "address": "紐西蘭奧塔哥大區瓦卡蒂普湖", "placeId": "ChIJCU1T-pb81KkR4CBlq4bvACo", "rawQuery": "瓦卡蒂普湖", "verified": true, "confidence": 0.9192923076923076, "normalized": "瓦卡蒂普湖", "rawMention": "瓦卡蒂普湖", "cleanedName": "瓦卡蒂普湖", "description": "這邊一邊看風景一邊吃東西 也是很棒的體驗，如果有買包含午晚餐的方案 也可以坐在景觀餐廳 邊吃飯邊看風景哦", "resolvedFrom": "google-geocode", "normalizedName": "瓦卡蒂普湖", "extractionSource": "ai-polished"}, {"lat": -44.4696976, "lng": 169.3014845, "raw": "哈威亞湖", "name": "哈威亞湖", "address": "9382紐西蘭奧塔哥大區哈威亞湖", "placeId": "ChIJj_ndzDVU1WwR0Bxlq4bvACo", "rawQuery": "哈威亞湖", "verified": true, "confidence": 0.8815999999999999, "normalized": "哈威亞湖", "rawMention": "哈威亞湖", "cleanedName": "哈威亞湖", "description": "我們要開進Deer Park之前，它會有一個把我們擋住的欄桿，後面就是哈威亞湖", "resolvedFrom": "google-geocode", "normalizedName": "哈威亞湖", "extractionSource": "ai-polished"}, {"lat": -44.6414024, "lng": 167.8973801, "raw": "米爾福德峽灣", "name": "米爾福德峽灣", "address": "紐西蘭南地大區米爾福德峽灣", "placeId": "ChIJ4UlLuk3g1akRAN5kq4bvACo", "rawQuery": "米爾福德峽灣", "verified": true, "confidence": 0.9408307692307691, "normalized": "米爾福德峽灣", "rawMention": "米爾福德峽灣", "cleanedName": "米爾福德峽灣", "description": "我們現在在皇后鎮這邊的商場他百貨公司裡這間Giorgio Armani 好像是這個東西吧 黑曜石精華水，米爾福德峽灣", "resolvedFrom": "google-geocode", "normalizedName": "米爾福德峽灣", "extractionSource": "ai-polished"}, {"lat": -44.85161979999999, "lng": 168.3810132, "raw": "格林諾奇碼頭", "name": "格林諾奇碼頭", "address": "4 Islay Street, Glenorchy 9372紐西蘭", "placeId": "ChIJ_2OAF_ql1akRxY1wxfjIDCo", "rawQuery": "格林諾奇碼頭", "verified": true, "confidence": 0.7135999999999999, "normalized": "格林諾奇碼頭", "rawMention": "格林諾奇碼頭", "cleanedName": "格林諾奇碼頭", "description": "逛累了，根據地點描述，這邊還有一個超大的Lounge 可以在這邊休息 很舒服的一間百貨 超讚的", "resolvedFrom": "google-place-details", "normalizedName": "格林諾奇碼頭", "extractionSource": "ai-polished"}, {"lat": -43.5949749, "lng": 170.1417883, "raw": "庫克山", "name": "庫克山", "address": "7999紐西蘭坎特伯雷庫克山", "placeId": "ChIJyzN1lfTLK20RZeiD_UXKWSQ", "rawQuery": "庫克山", "verified": true, "confidence": 0.8715999999999999, "normalized": "庫克山", "rawMention": "庫克山", "cleanedName": "庫克山", "description": "上一集我們紐西蘭之旅到了 紐西蘭的最高峰庫克山", "resolvedFrom": "google-geocode", "normalizedName": "庫克山", "extractionSource": "ai-polished"}, {"lat": -43.5983151, "lng": 170.2167344, "raw": "塔斯曼冰川", "name": "塔斯曼冰川", "address": "Tasman Glacier, Canterbury Region 7999紐西蘭", "placeId": "ChIJteAQwkLJK20R0VWYCIjGwlc", "rawQuery": "塔斯曼冰川", "verified": true, "confidence": 0.7135999999999999, "normalized": "塔斯曼冰川", "rawMention": "塔斯曼冰川", "cleanedName": "塔斯曼冰川", "description": "也到了瓦納卡看孤獨樹 吃了很多美食 上一集我們紐西蘭之旅到了 紐西蘭的最高峰庫克山 去走他們的絕美步道 還搭直升機到他們最大的 塔斯曼冰川上面健行", "resolvedFrom": "google-geocode", "normalizedName": "塔斯曼冰川", "extractionSource": "ai-polished"}]}, "source": "youtube-summary-service", "summary": "影片提到Skyline天空纜車、Castle hill、Fergburger等地點，以及Fergburger、班尼迪克蛋、漢堡等食物。", "segments": [{"id": "simple_segment_1", "text": "這個纜車是南半球最陡的纜車，坐上纜車可以到皇后鎮的最高峰 450公尺高的包伯峰上面俯瞰整個皇后鎮 還有瓦卡蒂普湖", "foods": [], "title": "Skyline天空纜車", "summary": "這個纜車是南半球最陡的纜車，坐上纜車可以到皇后鎮的最高峰 450公尺高的包伯峰上面俯瞰整個皇后鎮 還有瓦卡蒂普湖", "timestamp": "0:41", "endSeconds": 71, "startLabel": "0:41", "startSeconds": 41, "locationHints": ["Skyline天空纜車"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_2", "text": "我們選擇玩3次的斜坡滑車 Castle hill", "foods": [], "title": "Castle hill", "summary": "我們選擇玩3次的斜坡滑車 Castle hill", "timestamp": "2:00", "endSeconds": 150, "startLabel": "2:00", "startSeconds": 120, "locationHints": ["Castle hill"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_3", "text": "這邊一邊看風景一邊吃東西 也是很棒的體驗，如果有買包含午晚餐的方案 也可以坐在景觀餐廳 邊吃飯邊看風景哦", "foods": ["Fergburger"], "title": "瓦卡蒂普湖", "summary": "這邊一邊看風景一邊吃東西 也是很棒的體驗，如果有買包含午晚餐的方案 也可以坐在景觀餐廳 邊吃飯邊看風景哦", "timestamp": "4:14", "endSeconds": 284, "startLabel": "4:14", "startSeconds": 254, "locationHints": ["瓦卡蒂普湖"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_4", "text": "這個店是被CNN評比為世界第一的漢堡店 Fergburger", "foods": ["Fergburger"], "title": "Fergburger", "summary": "這個店是被CNN評比為世界第一的漢堡店 Fergburger", "timestamp": "4:56", "endSeconds": 326, "startLabel": "4:56", "startSeconds": 296, "locationHints": ["Fergburger"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_5", "text": "我們要開進Deer Park之前，它會有一個把我們擋住的欄桿，後面就是哈威亞湖", "foods": [], "title": "哈威亞湖", "summary": "我們要開進Deer Park之前，它會有一個把我們擋住的欄桿，後面就是哈威亞湖", "timestamp": "9:01", "endSeconds": 571, "startLabel": "9:01", "startSeconds": 541, "locationHints": ["哈威亞湖"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_6", "text": "我們現在在皇后鎮這邊的商場他百貨公司裡這間Giorgio Armani 好像是這個東西吧 黑曜石精華水，米爾福德峽灣", "foods": ["麥盧卡蜂蜜"], "title": "米爾福德峽灣", "summary": "我們現在在皇后鎮這邊的商場他百貨公司裡這間Giorgio Armani 好像是這個東西吧 黑曜石精華水，米爾福德峽灣", "timestamp": "15:05", "endSeconds": 935, "startLabel": "15:05", "startSeconds": 905, "locationHints": ["米爾福德峽灣"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_7", "text": "逛累了，根據地點描述，這邊還有一個超大的Lounge 可以在這邊休息 很舒服的一間百貨 超讚的", "foods": ["麥盧卡蜂蜜"], "title": "格林諾奇碼頭", "summary": "逛累了，根據地點描述，這邊還有一個超大的Lounge 可以在這邊休息 很舒服的一間百貨 超讚的", "timestamp": "16:00", "endSeconds": 990, "startLabel": "16:00", "startSeconds": 960, "locationHints": ["格林諾奇碼頭"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_8", "text": "上一集我們紐西蘭之旅到了 紐西蘭的最高峰庫克山", "foods": [], "title": "庫克山", "summary": "上一集我們紐西蘭之旅到了 紐西蘭的最高峰庫克山", "timestamp": "27:48", "endSeconds": 1698, "startLabel": "27:48", "startSeconds": 1668, "locationHints": ["庫克山"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}], "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript", "extractedFoods": ["Fergburger", "班尼迪克蛋", "漢堡", "麥盧卡蜂蜜"], "mapsProvenance": "mixed", "transcriptSource": "youtube", "extractedLocations": ["Skyline天空纜車", "Castle hill", "Fergburger", "瓦卡蒂普湖", "哈威亞湖", "米爾福德峽灣", "格林諾奇碼頭", "庫克山", "塔斯曼冰川"]}	2026-06-06 20:38:02.507	2026-06-06 20:38:02.507
d02ad23a-6a01-4621-94fa-4c2e925cae17	video-simple-ollama-v5:2zzm_mXAS_E:zh-Hant	{"debug": {"cacheStatus": "miss", "captionKind": "manual", "captionSource": "youtube-transcript-package", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript", "finalFoodCount": 1, "captionLanguage": "zh-HK", "finalPlaceCount": 5, "pipelineVersion": "video-simple-ollama-v5", "failedChunkCount": 0, "transcriptSource": "youtube"}, "title": "【🇳🇿紐西蘭旅遊Ep2】10日9夜自駕遊北島 ~ 胡卡瀑布｜陶波湖麥當勞、超美Taupo Airbnb｜Whakapapa 雪山上的Cafe｜WaiOTapu 地熱世界", "video": {"id": "youtube_2zzm_mXAS_E", "url": "https://www.youtube.com/watch?v=2zzm_mXAS_E", "title": "【🇳🇿紐西蘭旅遊Ep2】10日9夜自駕遊北島 ~ 胡卡瀑布｜陶波湖麥當勞、超美Taupo Airbnb｜Whakapapa 雪山上的Cafe｜WaiOTapu 地熱世界", "source": "youtube-data-api", "summary": "影片提到胡卡瀑布、陶波湖、Whakapapa等地點，以及麥當勞等食物。", "videoId": "2zzm_mXAS_E", "duration": "23:07", "thumbnail": "https://i.ytimg.com/vi/2zzm_mXAS_E/hqdefault.jpg", "timestamps": [{"time": "0:59", "label": "胡卡瀑布"}, {"time": "1:28", "label": "陶波湖"}, {"time": "7:35", "label": "Mount Ruapehu"}, {"time": "7:58", "label": "Whakapapa"}, {"time": "20:21", "label": "Rotorua"}], "description": "📍紐西蘭北島 North Island\\n\\n旅行日期2024年7月\\nTravel Date: 2024.07\\n\\n10天9夜紐西蘭北島Part 1（奧克蘭、Waitomo螢火蟲洞穴）：\\nhttps://youtu.be/RDu4ub52LtE?si=6k4lIyDsH06CT6yb\\n\\n🚗 10天9夜紐西蘭北島～我們走過的路：\\n0:00 紐西蘭北島 Day 4-6\\n01:10 胡卡瀑布Huku Falls\\n01:35 Craters of the Moon \\n03:40 陶波湖麥當勞 The World Coolest Mcdonalds\\n04:45 超美景觀 陶波湖民宿 Taupo Airbnb\\n07:25 陶波湖～Whakapapa, Mount Ruapehu\\n11:20 Whakapapa Snow Park/ Sky Waka 纜車\\n12:20 雪山網紅Cafe～Knoll Ridge Chalet\\n13:10 「紐西蘭富士山」Mt ngauruhoe \\n16:40 紐西蘭懷奧塔普地熱世界 Wai-O-Tapu\\n19:30 Rotorua Redwoods Treewalk 紅木森林\\n21:40 下集預告：Rotorua 3日2夜\\n\\n✏️ 紐西蘭北島旅遊地圖｜10天9夜紐西蘭遊記：\\nhttps://we4-travel.com/nz-north-island/\\n\\n=========================\\n\\n影片中沒有旁白，只有輕鬆音樂。以第一人稱視角，和我們一起旅遊吧！\\n\\nWe do not narrate our videos, there will just be relaxing, soothing music. \\nImagine you are travelling with us. Sit back, grab a tea, and start travel. \\n\\n=========================\\n🛎Follow us on Instagram： http://instagram.com/voyagertt\\n🖥We4 Travel Blog：https://we4-travel.com\\n📬Job Inquires 合作查詢： we4travel2020@gmail.com\\n\\n=========================\\n\\n香港旅遊 - 推薦景點大合集👇🏼\\nhttps://youtube.com/playlist?list=PLWOVWh6kTWvN0JDqNvfmcVp0vXjhcwC1A\\n\\n日本旅遊（北海道｜東京河口湖｜京都琵琶湖｜飛驒高山｜沖繩） 👇🏼\\nhttps://youtube.com/playlist?list=PLWOVWh6kTWvNiEd7bKXoHyWmP9w5zsnb8\\n\\n如果喜歡影片記得Subscribe 我哋Channel，再Like & Share出去俾更多人睇啦（大感謝）😘\\nFeel Free to like and subscribe our channel for the latest travel tips in Hong Kong\\n\\n旅遊影片每星期更新！下集見❤️\\nTravel Videos update weekly! Stay Tune❤️\\n\\n============================\\n\\nCopyright WE4 TRAVEL© 2024. All Rights Reserved.All the video materials (except music) on this channel are original and recorded by We4Travel on location. Any copy, reproduction or republication of all or part of this video/audio is prohibited. \\n\\n==========================", "publishedAt": "2024-10-17T11:30:02Z", "channelTitle": "WE4 Travel 旅遊日常", "extractedFoods": ["麥當勞"], "summarySegments": [{"id": "simple_segment_1", "text": "差不多抵達新西蘭北島其中一個必到景點 - 胡卡瀑布", "foods": [], "title": "胡卡瀑布", "summary": "差不多抵達新西蘭北島其中一個必到景點 - 胡卡瀑布", "timestamp": "0:59", "endSeconds": 89, "startLabel": "0:59", "startSeconds": 59, "locationHints": ["胡卡瀑布"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_2", "text": "在進入陶波湖市中心前，到附近一個地熱景點看看", "foods": [], "title": "陶波湖", "summary": "在進入陶波湖市中心前，到附近一個地熱景點看看", "timestamp": "1:28", "endSeconds": 118, "startLabel": "1:28", "startSeconds": 88, "locationHints": ["陶波湖"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_3", "text": "看意外看到很像日本富士山的 Mt Ngauruhoe", "foods": [], "title": "Mount Ruapehu", "summary": "看意外看到很像日本富士山的 Mt Ngauruhoe", "timestamp": "7:35", "endSeconds": 485, "startLabel": "7:35", "startSeconds": 455, "locationHints": ["Mount Ruapehu"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_4", "text": "到達 Whakapapa Village, 先下車休息看看風景", "foods": [], "title": "Whakapapa", "summary": "到達 Whakapapa Village, 先下車休息看看風景", "timestamp": "7:58", "endSeconds": 508, "startLabel": "7:58", "startSeconds": 478, "locationHints": ["Whakapapa"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_5", "text": "期待下一集我們的「Rotorua3天2夜」吧～", "foods": [], "title": "Rotorua", "summary": "期待下一集我們的「Rotorua3天2夜」吧～", "timestamp": "20:21", "endSeconds": 1251, "startLabel": "20:21", "startSeconds": 1221, "locationHints": ["Rotorua"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}], "extractedLocations": [{"lat": -38.6486357, "lng": 176.0900496, "raw": "胡卡瀑布", "name": "胡卡瀑布", "address": "Wairakei, Taupō 3384紐西蘭", "placeId": "ChIJO3SUQfb4a20RdFpPIIeQnvE", "rawQuery": "胡卡瀑布", "verified": true, "confidence": 0.7135999999999999, "normalized": "胡卡瀑布", "rawMention": "胡卡瀑布", "cleanedName": "胡卡瀑布", "description": "差不多抵達新西蘭北島其中一個必到景點 - 胡卡瀑布", "resolvedFrom": "google-place-details", "normalizedName": "胡卡瀑布", "extractionSource": "ai-polished"}, {"lat": -38.7907719, "lng": 175.9040778, "raw": "陶波湖", "name": "陶波湖", "address": "紐西蘭 Waikato Region, 陶波湖", "placeId": "ChIJC7cYTGmTa20RgNjhZWHvACo", "rawQuery": "陶波湖", "verified": true, "confidence": 0.8558105263157894, "normalized": "陶波湖", "rawMention": "陶波湖", "cleanedName": "陶波湖", "description": "在進入陶波湖市中心前，到附近一個地熱景點看看", "resolvedFrom": "google-geocode", "normalizedName": "陶波湖", "extractionSource": "ai-polished"}, {"lat": -39.2367589, "lng": 175.5564999, "raw": "Whakapapa", "name": "Whakapapa", "address": "Top of Bruce Road, Manawatū-Whanganui Region 3989紐西蘭", "placeId": "ChIJk7TgHCr-am0RXO8VByTZ_2U", "rawQuery": "Whakapapa", "verified": true, "confidence": 0.7583999999999999, "normalized": "Whakapapa", "rawMention": "Whakapapa", "cleanedName": "Whakapapa", "description": "到達 Whakapapa Village, 先下車休息看看風景", "resolvedFrom": "google-place-details", "normalizedName": "Whakapapa", "extractionSource": "ai-polished"}, {"lat": -39.2817207, "lng": 175.5685104, "raw": "Mount Ruapehu", "name": "Mount Ruapehu", "address": "3382紐西蘭馬納瓦圖－旺加努伊魯阿佩胡山", "placeId": "ChIJxyVgAQT_am0RhOaSnLKKSfw", "rawQuery": "Mount Ruapehu", "verified": true, "confidence": 0.7135999999999999, "normalized": "Mount Ruapehu", "rawMention": "Mount Ruapehu", "cleanedName": "Mount Ruapehu", "description": "看意外看到很像日本富士山的 Mt Ngauruhoe", "resolvedFrom": "google-geocode", "normalizedName": "Mount Ruapehu", "extractionSource": "ai-polished"}, {"lat": -38.1445987, "lng": 176.2377669, "raw": "Rotorua", "name": "Rotorua", "address": "紐西蘭羅托路亞", "placeId": "ChIJK7L2gj2Ybm0RMZmjQ2HvAAU", "rawQuery": "Rotorua", "verified": true, "confidence": 0.55, "normalized": "Rotorua", "rawMention": "Rotorua", "cleanedName": "Rotorua", "description": "期待下一集我們的「Rotorua3天2夜」吧～", "resolvedFrom": "google-place-details", "normalizedName": "Rotorua", "extractionSource": "ai-polished"}]}, "source": "youtube-summary-service", "summary": "影片提到胡卡瀑布、陶波湖、Whakapapa等地點，以及麥當勞等食物。", "segments": [{"id": "simple_segment_1", "text": "差不多抵達新西蘭北島其中一個必到景點 - 胡卡瀑布", "foods": [], "title": "胡卡瀑布", "summary": "差不多抵達新西蘭北島其中一個必到景點 - 胡卡瀑布", "timestamp": "0:59", "endSeconds": 89, "startLabel": "0:59", "startSeconds": 59, "locationHints": ["胡卡瀑布"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_2", "text": "在進入陶波湖市中心前，到附近一個地熱景點看看", "foods": [], "title": "陶波湖", "summary": "在進入陶波湖市中心前，到附近一個地熱景點看看", "timestamp": "1:28", "endSeconds": 118, "startLabel": "1:28", "startSeconds": 88, "locationHints": ["陶波湖"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_3", "text": "看意外看到很像日本富士山的 Mt Ngauruhoe", "foods": [], "title": "Mount Ruapehu", "summary": "看意外看到很像日本富士山的 Mt Ngauruhoe", "timestamp": "7:35", "endSeconds": 485, "startLabel": "7:35", "startSeconds": 455, "locationHints": ["Mount Ruapehu"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_4", "text": "到達 Whakapapa Village, 先下車休息看看風景", "foods": [], "title": "Whakapapa", "summary": "到達 Whakapapa Village, 先下車休息看看風景", "timestamp": "7:58", "endSeconds": 508, "startLabel": "7:58", "startSeconds": 478, "locationHints": ["Whakapapa"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_5", "text": "期待下一集我們的「Rotorua3天2夜」吧～", "foods": [], "title": "Rotorua", "summary": "期待下一集我們的「Rotorua3天2夜」吧～", "timestamp": "20:21", "endSeconds": 1251, "startLabel": "20:21", "startSeconds": 1221, "locationHints": ["Rotorua"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}], "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript", "extractedFoods": ["麥當勞"], "mapsProvenance": "mixed", "transcriptSource": "youtube", "extractedLocations": ["胡卡瀑布", "陶波湖", "Whakapapa", "Mount Ruapehu", "Rotorua"]}	2026-06-06 20:38:21.254	2026-06-06 20:38:21.254
4cdb0fcc-eaf1-4b17-bfac-cbd250630ccd	video-simple-ollama-v5:JPRRnAFhDfU:zh-Hant	{"debug": {"cacheStatus": "miss", "captionKind": "manual", "captionSource": "youtube-transcript-package", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript", "finalFoodCount": 24, "captionLanguage": "zh-TW", "finalPlaceCount": 20, "pipelineVersion": "video-simple-ollama-v5", "failedChunkCount": 0, "transcriptSource": "youtube"}, "title": "【紐西蘭自由行攻略行程懶人包】🇳🇿紐西蘭20個必玩旅遊景點｜紐西蘭美食｜紐西蘭18天露營車自駕花費大公開", "video": {"id": "youtube_JPRRnAFhDfU", "url": "https://www.youtube.com/watch?v=JPRRnAFhDfU", "title": "【紐西蘭自由行攻略行程懶人包】🇳🇿紐西蘭20個必玩旅遊景點｜紐西蘭美食｜紐西蘭18天露營車自駕花費大公開", "source": "youtube-data-api", "summary": "影片提到Castle hill、好牧羊人教堂、蒂卡波湖等地點，以及牛排、羊排、炸魚薯條等食物。", "videoId": "JPRRnAFhDfU", "duration": "1:37:00", "thumbnail": "https://i.ytimg.com/vi/JPRRnAFhDfU/hqdefault.jpg", "timestamps": [{"time": "2:00", "label": "Castle hill"}, {"time": "5:54", "label": "胡克峽谷步道"}, {"time": "6:14", "label": "塔斯曼冰川"}, {"time": "6:46", "label": "蒂卡波湖"}, {"time": "7:13", "label": "好牧羊人教堂"}, {"time": "9:01", "label": "哈威亞湖"}, {"time": "10:30", "label": "約翰山天文台"}, {"time": "11:03", "label": "皇后鎮天空纜車"}], "description": "#紐西蘭旅遊景點  #紐西蘭景點 #紐西蘭美食\\n\\n🚁紐西蘭20個必玩旅遊景點：\\n📍Castle hill📍好牧羊人教堂📍約翰山天文台📍Tekapo springs 📍普卡基湖\\n📍胡克峽谷步道 📍塔斯曼冰川📍孤獨樹📍哈威亞湖📍瓦納卡薰衣草農場\\n📍皇后鎮天空纜車📍斜坡滑車📍Fergburger📍Deer Park Heights\\n📍米爾福德峽灣📍格林諾奇碼頭 📍格林諾奇魔界場景騎馬📍奧瑪魯歷史區 \\n📍藍企鵝保育中心📍阿卡羅阿羊駝牧場 📍玩跳傘或飛行傘\\n————————————————————\\n🚁紐西蘭實用連結：\\n📍房車國度租露營車網站：https://lurl.cc/yEdUbK\\n📍Campermate訂露營車營位網站：https://campermate.com/en\\n📍紐西蘭天氣查詢：https://www.metservice.com/\\n📍Tekapo springs官網：https://tekaposprings.co.nz/\\n📍Deer Park Heights預定：https://deerparkheights.co.nz/visiting/\\n📍藍企鵝歸巢秀預定：https://www.penguins.co.nz/chinese\\n————————————————————\\n🏡紐西蘭住宿推薦優惠訂房連結：\\n📍 隱士飯店(庫克山飯店首選)：https://reurl.cc/Nl2ZMk \\n📍瓦納卡溫德姆俱樂部飯店(瓦納卡新飯店)：https://reurl.cc/E6mZka\\n📍 Lakes Edge Holiday Park(蒂卡波湖露營區首選)：https://reurl.cc/Ll27O4\\n📍 Grand Suites Lake Tekapo (蒂卡波湖高級飯店)：https://reurl.cc/g6rzAQ\\n📍皇后鎮湖岸盛橡度假飯店(皇后鎮首選)：https://reurl.cc/6dGDA5\\n📍Poshtel(奧瑪魯高CP值)：https://reurl.cc/8XeWlb\\n📍Haka House Christchurch(基督城市區)：https://reurl.cc/bYdk56\\n📍梅菲爾飯店(基督城市中心、頂級五星)：https://reurl.cc/WNbkLk\\n————————————————————\\n紐西蘭18天露營車之旅影片：\\n🚁EP1【納尼亞巨石、蒂卡波湖觀星】：https://youtu.be/EplADeQo9gM\\n🚁EP2【庫克山直升機冰川探險】：https://youtu.be/4zJ1leCEJmo\\n🚁EP3【皇后鎮冒險、市區超好吃超好逛】：https://youtu.be/L9n1X0TkeQs\\n🚁EP4【世界第八大奇蹟、魔戒場景騎馬】：https://youtu.be/WEztBnK4OZs\\n🚁EP5【尋找世上最小藍企鵝、擁抱可愛羊駝】：https://youtu.be/xUWD2EBKHF4\\n————————————————————\\n🚁紐西蘭必玩旅遊景點優惠門票：\\n-KLOOK\\n📍約翰山天文台觀星：https://lurl.cc/WyzGHk\\n📍紐西蘭冰川直升機健行：https://lurl.cc/CgRqNf\\n📍皇后鎮高空跳傘：https://lurl.cc/qwUz1Y\\n📍米爾福德峽灣一日遊：https://lurl.cc/KrZFO7\\n📍阿卡羅阿莎瑪拉羊駝牧場之旅：https://lurl.cc/7zsunb\\n📍紐西蘭皇后鎮溫泉體驗：https://lurl.cc/VOHW81\\n📍TSS恩斯羅號蒸汽船至瓦爾特峰：https://lurl.cc/iDo4cD\\n📍蒂阿瑙螢火蟲洞之旅：https://lurl.cc/BV2NPU\\n📍全球租車(可異地還車)：https://reurl.cc/nDQbZ2\\n📍首次購票透過我的連結註冊，可獲得NT$100優惠回饋\\n👉https://reurl.cc/QX0zDZ\\n✨里歐專屬折扣碼：LEO6666 (全站商品95折)\\n\\n-KKDAY\\n📍蒂卡波暗夜保護區觀星導覽：https://lurl.cc/Z8YZ8G\\n📍紐西蘭冰川直升機健行：https://lurl.cc/1AyYBM\\n📍皇后鎮高空跳傘：https://lurl.cc/HXyGde\\n📍紐西蘭皇后鎮溫泉體驗：https://lurl.cc/5lvByj\\n📍米爾福德峽灣一日遊：https://lurl.cc/FnNrk2\\n📍皇后鎮天空纜車＆滑板車：https://lurl.cc/i2TKC9\\n📍蒂阿瑙螢火蟲洞之旅：https://lurl.cc/UPLPti\\n📍首次購票透過我的連結註冊，可獲得NT$100優惠回饋\\n👉https://reurl.cc/nLj8kn\\n✨里歐專屬折扣碼：KKLEO66 (滿NT$1,500享94折)\\n————————————————————\\n✈紐西蘭機票比價： https://skyscanner.pxf.io/rQJBNG\\n📱紐西蘭網路SIM卡(一定要買有送通話的很重要)：\\n📍紐西蘭4G上網通話SIM卡（台灣宅配到府）：https://lurl.cc/qbFxRq\\n📍紐西蘭40G上網+通話eSIM：https://lurl.cc/UKu9dk\\n————————————————————\\n🔗里歐愛旅遊部落格詳細圖文：https://leolovetravel.com\\n✨ IG：leolovetravel FB：里歐愛旅遊\\n————————————————————\\n👉本集重點段落\\n0:00 精采預告+開場\\n1:28 露營車開箱+預定攻略\\n4:46 城堡山\\n6:37 蒂卡波湖\\n18:47 冰川健行\\n28:11 庫克山\\n33:10 瓦納卡\\n43:32 自助加油攻略\\n45:33 皇后鎮\\n1:02:41 米爾福德峽灣\\n1:09:28 格林諾奇騎馬\\n1:15:25 奧瑪魯\\n1:25:54 阿卡羅阿", "publishedAt": "2025-01-03T12:43:19Z", "channelTitle": "里歐愛旅遊 leolovetravel", "extractedFoods": ["牛排", "羊排", "炸魚薯條", "蘿蔔蛋糕", "熱巧克力", "鯡魚三明治跟熱巧克力", "米爾福德峽灣", "鮭魚生魚片", "碎洋蔥鮭魚握壽司 鮭魚生魚片 炸蝦壽司卷 提拉米蘇", "檸檬派", "焦糖海鹽的甜甜圈", "那不勒斯意大利麵", "超大一個瑪格麗特披薩", "提拉米蘇", "白巧克力藍莓口味法式薄餅", "牛肉漢堡", "烤豬五花肉", "五花肉蘋果派", "班尼迪克蛋", "漢堡", "蔥抓餅", "巧達海鮮濃湯", "炸雞捲", "馬卡龍"], "summarySegments": [{"id": "simple_segment_1", "text": "這支影片幫大家整理了【紐西蘭自由行攻略行程懶人包】🇳🇿紐西蘭20個必玩旅遊景點｜紐西蘭美食｜紐西蘭18天露營車自駕花費大公開", "foods": [], "title": "Castle hill", "summary": "這支影片幫大家整理了【紐西蘭自由行攻略行程懶人包】🇳🇿紐西蘭20個必玩旅遊景點｜紐西蘭美食｜紐西蘭18天露營車自駕花費大公開", "timestamp": "2:00", "endSeconds": 150, "startLabel": "2:00", "startSeconds": 120, "locationHints": ["Castle hill"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_2", "text": "如果你要去走福克斯冰川的話，那你就一定會經過Castle hill", "foods": [], "title": "胡克峽谷步道", "summary": "如果你要去走福克斯冰川的話，那你就一定會經過Castle hill", "timestamp": "5:54", "endSeconds": 384, "startLabel": "5:54", "startSeconds": 354, "locationHints": ["胡克峽谷步道"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_3", "text": "我們這樣就可以節省體力節省時間，要怎麽前往Castle hill呢打開Google Maps導航Castle hill rocks", "foods": [], "title": "塔斯曼冰川", "summary": "我們這樣就可以節省體力節省時間，要怎麽前往Castle hill呢打開Google Maps導航Castle hill rocks", "timestamp": "6:14", "endSeconds": 404, "startLabel": "6:14", "startSeconds": 374, "locationHints": ["塔斯曼冰川"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_4", "text": "蒂卡波在毛利語代表晚上的草席，或在星空之下睡覺的意思 蒂卡波湖甚至是全世界第一個被UNESCO聯合國教科文組織列為星空自然保護區的小鎮", "foods": [], "title": "蒂卡波湖", "summary": "蒂卡波在毛利語代表晚上的草席，或在星空之下睡覺的意思 蒂卡波湖甚至是全世界第一個被UNESCO聯合國教科文組織列為星空自然保護區的小鎮", "timestamp": "6:46", "endSeconds": 436, "startLabel": "6:46", "startSeconds": 406, "locationHints": ["蒂卡波湖"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_5", "text": "好牧羊人教堂的日常保養跟維護都是完全依靠這一些贊助的錢", "foods": [], "title": "好牧羊人教堂", "summary": "好牧羊人教堂的日常保養跟維護都是完全依靠這一些贊助的錢", "timestamp": "7:13", "endSeconds": 463, "startLabel": "7:13", "startSeconds": 433, "locationHints": ["好牧羊人教堂"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_6", "text": "我們最愛吃的是台灣的三星蔥抓餅 到超市一定要買他們的 牛排跟羊排來吃哦 哇太香了", "foods": ["牛排", "羊排"], "title": "哈威亞湖", "summary": "我們最愛吃的是台灣的三星蔥抓餅 到超市一定要買他們的 牛排跟羊排來吃哦 哇太香了", "timestamp": "9:01", "endSeconds": 571, "startLabel": "9:01", "startSeconds": 541, "locationHints": ["哈威亞湖"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_7", "text": "約翰山天文台海拔有1,031公尺高 是蒂卡波湖附近的制高點 整個蒂卡波湖 還有下面的蒂卡波小鎮 到了晚上的時候 因為約翰山天文台這邊 沒有任何照明設備 所以為了安全考量 他們就會關閉", "foods": ["蘿蔔蛋糕", "熱巧克力", "鯡魚三明治跟熱巧克力"], "title": "約翰山天文台", "summary": "約翰山天文台海拔有1,031公尺高 是蒂卡波湖附近的制高點 整個蒂卡波湖 還有下面的蒂卡波小鎮 到了晚上的時候 因為約翰山天文台這邊 沒有任何照明設備 所以為了安全考量 他們就會關閉", "timestamp": "10:30", "endSeconds": 660, "startLabel": "10:30", "startSeconds": 630, "locationHints": ["約翰山天文台"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_8", "text": "這邊風非常大上來一定要戴好毛帽 我身後的彩虹超大的 啊~風也太大了吧 我快被吹飛了", "foods": ["炸魚薯條", "蘿蔔蛋糕", "熱巧克力", "鯡魚三明治跟熱巧克力"], "title": "皇后鎮天空纜車", "summary": "這邊風非常大上來一定要戴好毛帽 我身後的彩虹超大的 啊~風也太大了吧 我快被吹飛了", "timestamp": "11:03", "endSeconds": 693, "startLabel": "11:03", "startSeconds": 663, "locationHints": ["皇后鎮天空纜車"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}], "extractedLocations": [{"lat": -43.21871910000001, "lng": 171.7163086, "raw": "Castle hill", "name": "Castle hill", "address": "Castle Hill, New Zealand, Castle Hill 7580紐西蘭", "placeId": "ChIJfQnf8l5oLm0RWMRqnWCZ4ok", "rawQuery": "Castle hill", "verified": true, "confidence": 1.0072756756756756, "normalized": "Castle hill", "rawMention": "Castle hill", "cleanedName": "Castle hill", "description": "這支影片幫大家整理了【紐西蘭自由行攻略行程懶人包】🇳🇿紐西蘭20個必玩旅遊景點｜紐西蘭美食｜紐西蘭18天露營車自駕花費大公開", "resolvedFrom": "google-place-details", "normalizedName": "Castle hill", "extractionSource": "ai-polished"}, {"lat": -44.0033638, "lng": 170.4824622, "raw": "好牧羊人教堂", "name": "好牧羊人教堂", "address": "Pioneer Drive, Lake Tekapo 7999紐西蘭", "placeId": "ChIJfel69GF1K20RAsz_Rtcyivg", "rawQuery": "好牧羊人教堂", "verified": true, "confidence": 0.7135999999999999, "normalized": "好牧羊人教堂", "rawMention": "好牧羊人教堂", "cleanedName": "好牧羊人教堂", "description": "好牧羊人教堂的日常保養跟維護都是完全依靠這一些贊助的錢", "resolvedFrom": "google-geocode", "normalizedName": "好牧羊人教堂", "extractionSource": "ai-polished"}, {"lat": -43.9089865, "lng": 170.521919, "raw": "蒂卡波湖", "name": "蒂卡波湖", "address": "7999紐西蘭坎特伯雷特卡波湖", "placeId": "ChIJt9T3rAmZK20RwNhkq4bvACo", "rawQuery": "蒂卡波湖", "verified": true, "confidence": 0.7782153846153845, "normalized": "蒂卡波湖", "rawMention": "蒂卡波湖", "cleanedName": "蒂卡波湖", "description": "蒂卡波在毛利語代表晚上的草席，或在星空之下睡覺的意思 蒂卡波湖甚至是全世界第一個被UNESCO聯合國教科文組織列為星空自然保護區的小鎮", "resolvedFrom": "google-geocode", "normalizedName": "蒂卡波湖", "extractionSource": "ai-polished"}, {"lat": -43.71812569999999, "lng": 170.0939684, "raw": "胡克峽谷步道", "name": "胡克峽谷步道", "address": "Hooker Valley Track, Mt Cook National Park 7999紐西蘭", "placeId": "ChIJ3dRpHTRLKm0RKcgIu1qEvGM", "rawQuery": "胡克峽谷步道", "verified": true, "confidence": 0.7135999999999999, "normalized": "胡克峽谷步道", "rawMention": "胡克峽谷步道", "cleanedName": "胡克峽谷步道", "description": "如果你要去走福克斯冰川的話，那你就一定會經過Castle hill", "resolvedFrom": "google-place-details", "normalizedName": "胡克峽谷步道", "extractionSource": "ai-polished"}, {"lat": -43.5983151, "lng": 170.2167344, "raw": "塔斯曼冰川", "name": "塔斯曼冰川", "address": "Tasman Glacier, Canterbury Region 7999紐西蘭", "placeId": "ChIJteAQwkLJK20R0VWYCIjGwlc", "rawQuery": "塔斯曼冰川", "verified": true, "confidence": 0.7135999999999999, "normalized": "塔斯曼冰川", "rawMention": "塔斯曼冰川", "cleanedName": "塔斯曼冰川", "description": "我們這樣就可以節省體力節省時間，要怎麽前往Castle hill呢打開Google Maps導航Castle hill rocks", "resolvedFrom": "google-geocode", "normalizedName": "塔斯曼冰川", "extractionSource": "ai-polished"}, {"lat": -44.4696976, "lng": 169.3014845, "raw": "哈威亞湖", "name": "哈威亞湖", "address": "9382紐西蘭奧塔哥大區哈威亞湖", "placeId": "ChIJj_ndzDVU1WwR0Bxlq4bvACo", "rawQuery": "哈威亞湖", "verified": true, "confidence": 0.8815999999999999, "normalized": "哈威亞湖", "rawMention": "哈威亞湖", "cleanedName": "哈威亞湖", "description": "我們最愛吃的是台灣的三星蔥抓餅 到超市一定要買他們的 牛排跟羊排來吃哦 哇太香了", "resolvedFrom": "google-geocode", "normalizedName": "哈威亞湖", "extractionSource": "ai-polished"}, {"lat": -45.0284542, "lng": 168.656109, "raw": "皇后鎮天空纜車", "name": "皇后鎮天空纜車", "address": "53 Brecon Street, Queenstown 9300紐西蘭", "placeId": "ChIJqSoMFgAd1akRcBJGZxOV8lY", "rawQuery": "皇后鎮天空纜車", "verified": true, "confidence": 0.7135999999999999, "normalized": "皇后鎮天空纜車", "rawMention": "皇后鎮天空纜車", "cleanedName": "皇后鎮天空纜車", "description": "這邊風非常大上來一定要戴好毛帽 我身後的彩虹超大的 啊~風也太大了吧 我快被吹飛了", "resolvedFrom": "google-geocode", "normalizedName": "皇后鎮天空纜車", "extractionSource": "ai-polished"}, {"lat": -43.9852108, "lng": 170.4641324, "raw": "約翰山天文台", "name": "約翰山天文台", "address": "Tekapo 7999紐西蘭", "placeId": "ChIJqbONRvKfK20Ri6emJZoBRXE", "rawQuery": "約翰山天文台", "verified": true, "confidence": 0.7135999999999999, "normalized": "約翰山天文台", "rawMention": "約翰山天文台", "cleanedName": "約翰山天文台", "description": "約翰山天文台海拔有1,031公尺高 是蒂卡波湖附近的制高點 整個蒂卡波湖 還有下面的蒂卡波小鎮 到了晚上的時候 因為約翰山天文台這邊 沒有任何照明設備 所以為了安全考量 他們就會關閉", "resolvedFrom": "google-geocode", "normalizedName": "約翰山天文台", "extractionSource": "ai-polished"}, {"lat": -45.0284542, "lng": 168.656109, "raw": "斜坡滑車", "name": "斜坡滑車", "address": "53 Brecon Street, Queenstown 9300紐西蘭", "placeId": "ChIJi-lpol4d1akRFDWVX68fl5E", "rawQuery": "斜坡滑車", "verified": true, "confidence": 0.7135999999999999, "normalized": "斜坡滑車", "rawMention": "斜坡滑車", "cleanedName": "斜坡滑車", "description": "我們現在從約翰山天文台下來 回到我們營區旁邊 這個湖景第一排的地方 它的旁邊有一台這個小餐車 the better batter", "resolvedFrom": "google-place-details", "normalizedName": "斜坡滑車", "extractionSource": "ai-polished"}, {"lat": -43.9947846, "lng": 170.4608946, "raw": "Tekapo Springs", "name": "Tekapo Springs", "address": "300 Lakeside Drive, Lake Tekapo 7945紐西蘭", "placeId": "ChIJ59bjll91K20RAqcIV5KgwD8", "rawQuery": "Tekapo Springs", "verified": true, "confidence": 0.8231652173913042, "normalized": "Tekapo Springs", "rawMention": "Tekapo Springs", "cleanedName": "Tekapo Springs", "description": "Tekapo Springs這邊有一個 超大的戶外露天溫泉池 可以在這邊泡著熱水 舒解我們到紐西蘭這邊的疲勞", "resolvedFrom": "google-place-details", "normalizedName": "Tekapo Springs", "extractionSource": "ai-polished"}, {"lat": -43.98568059999999, "lng": 170.465039, "raw": "Astro Cafe", "name": "Astro Cafe", "address": "Godley Peaks Road, Lake Tekapo 7945紐西蘭", "placeId": "ChIJPVAvfgqqK20R3mTXAMjR4mE", "rawQuery": "Astro Cafe", "verified": true, "confidence": 0.7935999999999999, "normalized": "Astro Cafe", "rawMention": "Astro Cafe", "cleanedName": "Astro Cafe", "description": "Astro Cafe也在旁邊", "resolvedFrom": "google-place-details", "normalizedName": "Astro Cafe", "extractionSource": "ai-polished"}, {"lat": -43.9852108, "lng": 170.4641324, "raw": "約翰山大學天文台", "name": "約翰山大學天文台", "address": "Tekapo 7999紐西蘭", "placeId": "ChIJqbONRvKfK20Ri6emJZoBRXE", "rawQuery": "約翰山大學天文台", "verified": true, "confidence": 0.7135999999999999, "normalized": "約翰山大學天文台", "rawMention": "約翰山大學天文台", "cleanedName": "約翰山大學天文台", "description": "可以Google Maps導航約翰山大學天文台", "resolvedFrom": "google-geocode", "normalizedName": "約翰山大學天文台", "extractionSource": "ai-polished"}, {"lat": -44.85161979999999, "lng": 168.3810132, "raw": "格林諾奇碼頭", "name": "格林諾奇碼頭", "address": "4 Islay Street, Glenorchy 9372紐西蘭", "placeId": "ChIJ_2OAF_ql1akRxY1wxfjIDCo", "rawQuery": "格林諾奇碼頭", "verified": true, "confidence": 0.7135999999999999, "normalized": "格林諾奇碼頭", "rawMention": "格林諾奇碼頭", "cleanedName": "格林諾奇碼頭", "description": "格林諾奇魔界場景騎馬", "resolvedFrom": "google-place-details", "normalizedName": "格林諾奇碼頭", "extractionSource": "ai-polished"}, {"lat": -43.5949749, "lng": 170.1417883, "raw": "庫克山", "name": "庫克山", "address": "7999紐西蘭坎特伯雷庫克山", "placeId": "ChIJyzN1lfTLK20RZeiD_UXKWSQ", "rawQuery": "庫克山", "verified": true, "confidence": 0.8715999999999999, "normalized": "庫克山", "rawMention": "庫克山", "cleanedName": "庫克山", "description": "我們今天報名klook的一日行程 要搭乘直升機，直接飛往塔斯曼冰川上面。庫克山的海拔有3,724公尺 是紐西蘭的最高峰", "resolvedFrom": "google-geocode", "normalizedName": "庫克山", "extractionSource": "ai-polished"}, {"lat": -44.6942992, "lng": 169.1417356, "raw": "瓦納卡", "name": "瓦納卡", "address": "紐西蘭瓦納卡", "placeId": "ChIJby3suR1G1akR4MF5hIbvAAU", "rawQuery": "瓦納卡", "verified": true, "confidence": 0.55, "normalized": "瓦納卡", "rawMention": "瓦納卡", "cleanedName": "瓦納卡", "description": "今天要吃的是瓦納卡這邊很有名的麵包店 這一間 Pembroke Patisserie。Google Maps導航 隱士飯店就可以抵達 從庫克山前往皇后鎮 大約需要3個半小時，建議大家可以在中間的瓦納卡休息", "resolvedFrom": "google-place-details", "normalizedName": "瓦納卡", "extractionSource": "ai-polished"}, {"lat": -43.7326765, "lng": 170.0929023, "raw": "隱士飯店", "name": "隱士飯店", "address": "7999紐西蘭 Canterbury Region, Terrace Road, 奧拉基/庫克山國家公園", "placeId": "ChIJg8ljtFJLKm0RWBgsSr5MUTA", "rawQuery": "隱士飯店", "verified": true, "confidence": 0.7135999999999999, "normalized": "隱士飯店", "rawMention": "隱士飯店", "cleanedName": "隱士飯店", "description": "1974s] 要怎麽前往隱士飯店呢 Google Maps導航 隱士飯店就可以抵達", "resolvedFrom": "google-place-details", "normalizedName": "隱士飯店", "extractionSource": "ai-polished"}]}, "source": "youtube-summary-service", "summary": "影片提到Castle hill、好牧羊人教堂、蒂卡波湖等地點，以及牛排、羊排、炸魚薯條等食物。", "segments": [{"id": "simple_segment_1", "text": "這支影片幫大家整理了【紐西蘭自由行攻略行程懶人包】🇳🇿紐西蘭20個必玩旅遊景點｜紐西蘭美食｜紐西蘭18天露營車自駕花費大公開", "foods": [], "title": "Castle hill", "summary": "這支影片幫大家整理了【紐西蘭自由行攻略行程懶人包】🇳🇿紐西蘭20個必玩旅遊景點｜紐西蘭美食｜紐西蘭18天露營車自駕花費大公開", "timestamp": "2:00", "endSeconds": 150, "startLabel": "2:00", "startSeconds": 120, "locationHints": ["Castle hill"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_2", "text": "如果你要去走福克斯冰川的話，那你就一定會經過Castle hill", "foods": [], "title": "胡克峽谷步道", "summary": "如果你要去走福克斯冰川的話，那你就一定會經過Castle hill", "timestamp": "5:54", "endSeconds": 384, "startLabel": "5:54", "startSeconds": 354, "locationHints": ["胡克峽谷步道"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_3", "text": "我們這樣就可以節省體力節省時間，要怎麽前往Castle hill呢打開Google Maps導航Castle hill rocks", "foods": [], "title": "塔斯曼冰川", "summary": "我們這樣就可以節省體力節省時間，要怎麽前往Castle hill呢打開Google Maps導航Castle hill rocks", "timestamp": "6:14", "endSeconds": 404, "startLabel": "6:14", "startSeconds": 374, "locationHints": ["塔斯曼冰川"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_4", "text": "蒂卡波在毛利語代表晚上的草席，或在星空之下睡覺的意思 蒂卡波湖甚至是全世界第一個被UNESCO聯合國教科文組織列為星空自然保護區的小鎮", "foods": [], "title": "蒂卡波湖", "summary": "蒂卡波在毛利語代表晚上的草席，或在星空之下睡覺的意思 蒂卡波湖甚至是全世界第一個被UNESCO聯合國教科文組織列為星空自然保護區的小鎮", "timestamp": "6:46", "endSeconds": 436, "startLabel": "6:46", "startSeconds": 406, "locationHints": ["蒂卡波湖"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_5", "text": "好牧羊人教堂的日常保養跟維護都是完全依靠這一些贊助的錢", "foods": [], "title": "好牧羊人教堂", "summary": "好牧羊人教堂的日常保養跟維護都是完全依靠這一些贊助的錢", "timestamp": "7:13", "endSeconds": 463, "startLabel": "7:13", "startSeconds": 433, "locationHints": ["好牧羊人教堂"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_6", "text": "我們最愛吃的是台灣的三星蔥抓餅 到超市一定要買他們的 牛排跟羊排來吃哦 哇太香了", "foods": ["牛排", "羊排"], "title": "哈威亞湖", "summary": "我們最愛吃的是台灣的三星蔥抓餅 到超市一定要買他們的 牛排跟羊排來吃哦 哇太香了", "timestamp": "9:01", "endSeconds": 571, "startLabel": "9:01", "startSeconds": 541, "locationHints": ["哈威亞湖"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_7", "text": "約翰山天文台海拔有1,031公尺高 是蒂卡波湖附近的制高點 整個蒂卡波湖 還有下面的蒂卡波小鎮 到了晚上的時候 因為約翰山天文台這邊 沒有任何照明設備 所以為了安全考量 他們就會關閉", "foods": ["蘿蔔蛋糕", "熱巧克力", "鯡魚三明治跟熱巧克力"], "title": "約翰山天文台", "summary": "約翰山天文台海拔有1,031公尺高 是蒂卡波湖附近的制高點 整個蒂卡波湖 還有下面的蒂卡波小鎮 到了晚上的時候 因為約翰山天文台這邊 沒有任何照明設備 所以為了安全考量 他們就會關閉", "timestamp": "10:30", "endSeconds": 660, "startLabel": "10:30", "startSeconds": 630, "locationHints": ["約翰山天文台"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}, {"id": "simple_segment_8", "text": "這邊風非常大上來一定要戴好毛帽 我身後的彩虹超大的 啊~風也太大了吧 我快被吹飛了", "foods": ["炸魚薯條", "蘿蔔蛋糕", "熱巧克力", "鯡魚三明治跟熱巧克力"], "title": "皇后鎮天空纜車", "summary": "這邊風非常大上來一定要戴好毛帽 我身後的彩虹超大的 啊~風也太大了吧 我快被吹飛了", "timestamp": "11:03", "endSeconds": 693, "startLabel": "11:03", "startSeconds": 663, "locationHints": ["皇后鎮天空纜車"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}], "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript", "extractedFoods": ["牛排", "羊排", "炸魚薯條", "蘿蔔蛋糕", "熱巧克力", "鯡魚三明治跟熱巧克力", "米爾福德峽灣", "鮭魚生魚片", "碎洋蔥鮭魚握壽司 鮭魚生魚片 炸蝦壽司卷 提拉米蘇", "檸檬派", "焦糖海鹽的甜甜圈", "那不勒斯意大利麵", "超大一個瑪格麗特披薩", "提拉米蘇", "白巧克力藍莓口味法式薄餅", "牛肉漢堡", "烤豬五花肉", "五花肉蘋果派", "班尼迪克蛋", "漢堡", "蔥抓餅", "巧達海鮮濃湯", "炸雞捲", "馬卡龍"], "mapsProvenance": "mixed", "transcriptSource": "youtube", "extractedLocations": ["Castle hill", "好牧羊人教堂", "蒂卡波湖", "胡克峽谷步道", "塔斯曼冰川", "哈威亞湖", "皇后鎮天空纜車", "約翰山天文台", "斜坡滑車", "Tekapo Springs", "Astro Cafe", "約翰山大學天文台", "格林諾奇碼頭", "庫克山", "瓦納卡", "隱士飯店"]}	2026-06-06 20:39:57.183	2026-06-06 20:39:57.183
b954eaa2-84ad-4fb0-8f5f-729d8410e43c	video-simple-ollama-v5:MivGUH-15zw:zh-Hant	{"debug": {"cacheStatus": "miss", "captionKind": "manual", "captionSource": "youtube-transcript-package", "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript", "finalFoodCount": 0, "captionLanguage": "zh-HK", "finalPlaceCount": 1, "pipelineVersion": "video-simple-ollama-v5", "failedChunkCount": 0, "transcriptSource": "youtube"}, "title": "紐西蘭自駕遊 | 小心！香港10年牌都中伏，一落地就硬食$150罰款！5大駕駛規矩／注意事項，遊客必睇！#紐西蘭旅行 #紐西蘭自由行 #紐西蘭 #紐西蘭旅遊貼士", "video": {"id": "youtube_MivGUH-15zw", "url": "https://www.youtube.com/watch?v=MivGUH-15zw", "title": "紐西蘭自駕遊 | 小心！香港10年牌都中伏，一落地就硬食$150罰款！5大駕駛規矩／注意事項，遊客必睇！#紐西蘭旅行 #紐西蘭自由行 #紐西蘭 #紐西蘭旅遊貼士", "source": "youtube-data-api", "summary": "影片提到紐市政府等地點。", "videoId": "MivGUH-15zw", "duration": "08:42", "thumbnail": "https://i.ytimg.com/vi/MivGUH-15zw/hqdefault.jpg", "timestamps": [{"time": "3:28", "label": "紐市政府"}], "description": "前往紐西蘭旅行，如果希望造訪公共交通無法直達的地方，自駕遊無疑是最方便的方式。然而，紐西蘭的交通規則與香港、台灣有不少差異，稍一不慎便有機會被罰款，甚至面臨拖車或遣返的風險。\\n\\n本片將為大家整理 五項遊客最需要留意的駕駛重點：\\n1️⃣ 基本方向：香港駕駛者相對容易適應，但台灣朋友則需特別留意左右相反。\\n2️⃣ 巴士專線 Bus Lane：有 50 米限制及不同時段規定，我本人亦曾因誤闖而被罰款 150 紐元。\\n3️⃣ 交通燈使用習慣：與香港存在差異，初到紐西蘭駕駛必須格外小心。\\n4️⃣ 泊車規則：違例泊車有機會被即時拖走，影響行程。\\n5️⃣ 酒後駕駛規定：雖然容許酒精含量與香港不同，但對遊客而言仍應避免，以免惹上麻煩。\\n\\n✅ 總結：紐西蘭自駕雖然方便，但必須清楚了解當地交通規則，才能在旅途中安全又安心。\\n\\n👉 記得訂閱【食住玩紐西蘭】，繼續探索更多紐西蘭的旅遊資訊、生活點滴與美食推介！\\n\\n#紐西蘭 #紐西蘭自駕 #紐西蘭旅行 #NZDriving #NZTravel #自駕遊 #紐西蘭旅遊貼士 #Auckland #紐西蘭自由行 #奧克蘭", "publishedAt": "2025-09-05T12:00:45Z", "channelTitle": "食住玩紐西蘭", "extractedFoods": [], "summarySegments": [{"id": "simple_segment_1", "text": "在2021年時為市政府籌得430萬紐元", "foods": [], "title": "紐市政府", "summary": "在2021年時為市政府籌得430萬紐元", "timestamp": "3:28", "endSeconds": 238, "startLabel": "3:28", "startSeconds": 208, "locationHints": ["紐市政府"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}], "extractedLocations": [{"lat": null, "lng": null, "raw": "紐市政府", "name": "紐市政府", "rawQuery": "紐市政府", "verified": false, "confidence": 0.35, "normalized": "紐市政府", "rawMention": "紐市政府", "cleanedName": "紐市政府", "description": "紐市政府，影片中提到的地點（尚無法對應地圖座標）。", "resolvedFrom": "llm", "normalizedName": "紐市政府", "extractionSource": "ai-polished", "geocodeRejectedReason": "segment-hint-no-geocode"}]}, "source": "youtube-summary-service", "summary": "影片提到紐市政府等地點。", "segments": [{"id": "simple_segment_1", "text": "在2021年時為市政府籌得430萬紐元", "foods": [], "title": "紐市政府", "summary": "在2021年時為市政府籌得430萬紐元", "timestamp": "3:28", "endSeconds": 238, "startLabel": "3:28", "startSeconds": 208, "locationHints": ["紐市政府"], "timestampSource": "youtube-transcript", "extractionSource": "ai-polished", "timestampConfidence": "high"}], "segmentSource": "transcript-chunks", "summarySource": "ollama-transcript", "extractedFoods": [], "mapsProvenance": "catalog-fallback", "transcriptSource": "youtube", "extractedLocations": ["紐市政府"]}	2026-06-06 20:40:37.721	2026-06-06 20:40:37.721
\.


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: applied_video_summaries applied_video_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.applied_video_summaries
    ADD CONSTRAINT applied_video_summaries_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: collaboration_presence collaboration_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.collaboration_presence
    ADD CONSTRAINT collaboration_presence_pkey PRIMARY KEY (id);


--
-- Name: collaboration_rooms collaboration_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.collaboration_rooms
    ADD CONSTRAINT collaboration_rooms_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: itinerary_folders itinerary_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.itinerary_folders
    ADD CONSTRAINT itinerary_folders_pkey PRIMARY KEY (id);


--
-- Name: map_pins map_pins_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.map_pins
    ADD CONSTRAINT map_pins_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: trip_collaborators trip_collaborators_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.trip_collaborators
    ADD CONSTRAINT trip_collaborators_pkey PRIMARY KEY (id);


--
-- Name: trip_days trip_days_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.trip_days
    ADD CONSTRAINT trip_days_pkey PRIMARY KEY (id);


--
-- Name: trip_items trip_items_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.trip_items
    ADD CONSTRAINT trip_items_pkey PRIMARY KEY (id);


--
-- Name: trip_publications trip_publications_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.trip_publications
    ADD CONSTRAINT trip_publications_pkey PRIMARY KEY (id);


--
-- Name: trips trips_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: video_interactions video_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.video_interactions
    ADD CONSTRAINT video_interactions_pkey PRIMARY KEY (id);


--
-- Name: video_summary_caches video_summary_caches_pkey; Type: CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.video_summary_caches
    ADD CONSTRAINT video_summary_caches_pkey PRIMARY KEY (id);


--
-- Name: accounts_provider_providerAccountId_key; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON public.accounts USING btree (provider, "providerAccountId");


--
-- Name: applied_video_summaries_tripId_appliedAt_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "applied_video_summaries_tripId_appliedAt_idx" ON public.applied_video_summaries USING btree ("tripId", "appliedAt");


--
-- Name: applied_video_summaries_userId_appliedAt_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "applied_video_summaries_userId_appliedAt_idx" ON public.applied_video_summaries USING btree ("userId", "appliedAt");


--
-- Name: applied_video_summaries_videoId_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "applied_video_summaries_videoId_idx" ON public.applied_video_summaries USING btree ("videoId");


--
-- Name: chat_messages_tripId_createdAt_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "chat_messages_tripId_createdAt_idx" ON public.chat_messages USING btree ("tripId", "createdAt");


--
-- Name: chat_messages_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "chat_messages_userId_createdAt_idx" ON public.chat_messages USING btree ("userId", "createdAt");


--
-- Name: collaboration_presence_roomId_lastSeenAt_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "collaboration_presence_roomId_lastSeenAt_idx" ON public.collaboration_presence USING btree ("roomId", "lastSeenAt");


--
-- Name: collaboration_presence_roomId_userId_key; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE UNIQUE INDEX "collaboration_presence_roomId_userId_key" ON public.collaboration_presence USING btree ("roomId", "userId");


--
-- Name: collaboration_rooms_inviteCode_key; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE UNIQUE INDEX "collaboration_rooms_inviteCode_key" ON public.collaboration_rooms USING btree ("inviteCode");


--
-- Name: collaboration_rooms_tripId_key; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE UNIQUE INDEX "collaboration_rooms_tripId_key" ON public.collaboration_rooms USING btree ("tripId");


--
-- Name: comments_roomId_createdAt_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "comments_roomId_createdAt_idx" ON public.comments USING btree ("roomId", "createdAt");


--
-- Name: itinerary_folders_userId_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "itinerary_folders_userId_idx" ON public.itinerary_folders USING btree ("userId");


--
-- Name: map_pins_tripId_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "map_pins_tripId_idx" ON public.map_pins USING btree ("tripId");


--
-- Name: profiles_userId_key; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE UNIQUE INDEX "profiles_userId_key" ON public.profiles USING btree ("userId");


--
-- Name: sessions_sessionToken_key; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE UNIQUE INDEX "sessions_sessionToken_key" ON public.sessions USING btree ("sessionToken");


--
-- Name: trip_collaborators_tripId_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "trip_collaborators_tripId_idx" ON public.trip_collaborators USING btree ("tripId");


--
-- Name: trip_collaborators_tripId_userId_key; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE UNIQUE INDEX "trip_collaborators_tripId_userId_key" ON public.trip_collaborators USING btree ("tripId", "userId");


--
-- Name: trip_collaborators_userId_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "trip_collaborators_userId_idx" ON public.trip_collaborators USING btree ("userId");


--
-- Name: trip_days_tripId_dayNumber_key; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE UNIQUE INDEX "trip_days_tripId_dayNumber_key" ON public.trip_days USING btree ("tripId", "dayNumber");


--
-- Name: trip_days_tripId_sortOrder_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "trip_days_tripId_sortOrder_idx" ON public.trip_days USING btree ("tripId", "sortOrder");


--
-- Name: trip_items_tripId_day_order_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "trip_items_tripId_day_order_idx" ON public.trip_items USING btree ("tripId", day, "order");


--
-- Name: trip_publications_publishedAt_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "trip_publications_publishedAt_idx" ON public.trip_publications USING btree ("publishedAt" DESC);


--
-- Name: trip_publications_publisherId_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "trip_publications_publisherId_idx" ON public.trip_publications USING btree ("publisherId");


--
-- Name: trip_publications_tripId_key; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE UNIQUE INDEX "trip_publications_tripId_key" ON public.trip_publications USING btree ("tripId");


--
-- Name: trips_folderId_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "trips_folderId_idx" ON public.trips USING btree ("folderId");


--
-- Name: trips_userId_updatedAt_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "trips_userId_updatedAt_idx" ON public.trips USING btree ("userId", "updatedAt");


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: verification_tokens_identifier_token_key; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE UNIQUE INDEX verification_tokens_identifier_token_key ON public.verification_tokens USING btree (identifier, token);


--
-- Name: verification_tokens_token_key; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE UNIQUE INDEX verification_tokens_token_key ON public.verification_tokens USING btree (token);


--
-- Name: video_interactions_tripId_createdAt_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "video_interactions_tripId_createdAt_idx" ON public.video_interactions USING btree ("tripId", "createdAt");


--
-- Name: video_interactions_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "video_interactions_userId_createdAt_idx" ON public.video_interactions USING btree ("userId", "createdAt");


--
-- Name: video_interactions_videoId_idx; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE INDEX "video_interactions_videoId_idx" ON public.video_interactions USING btree ("videoId");


--
-- Name: video_summary_caches_videoId_key; Type: INDEX; Schema: public; Owner: aiyo
--

CREATE UNIQUE INDEX "video_summary_caches_videoId_key" ON public.video_summary_caches USING btree ("videoId");


--
-- Name: accounts accounts_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: applied_video_summaries applied_video_summaries_tripId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.applied_video_summaries
    ADD CONSTRAINT "applied_video_summaries_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES public.trips(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: applied_video_summaries applied_video_summaries_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.applied_video_summaries
    ADD CONSTRAINT "applied_video_summaries_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_tripId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT "chat_messages_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES public.trips(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: chat_messages chat_messages_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT "chat_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: collaboration_presence collaboration_presence_roomId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.collaboration_presence
    ADD CONSTRAINT "collaboration_presence_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES public.collaboration_rooms(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: collaboration_presence collaboration_presence_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.collaboration_presence
    ADD CONSTRAINT "collaboration_presence_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: collaboration_rooms collaboration_rooms_tripId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.collaboration_rooms
    ADD CONSTRAINT "collaboration_rooms_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES public.trips(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comments comments_authorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comments comments_roomId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES public.collaboration_rooms(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: itinerary_folders itinerary_folders_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.itinerary_folders
    ADD CONSTRAINT "itinerary_folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: map_pins map_pins_tripId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.map_pins
    ADD CONSTRAINT "map_pins_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES public.trips(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: profiles profiles_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sessions sessions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trip_collaborators trip_collaborators_tripId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.trip_collaborators
    ADD CONSTRAINT "trip_collaborators_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES public.trips(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trip_collaborators trip_collaborators_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.trip_collaborators
    ADD CONSTRAINT "trip_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trip_days trip_days_tripId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.trip_days
    ADD CONSTRAINT "trip_days_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES public.trips(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trip_items trip_items_tripId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.trip_items
    ADD CONSTRAINT "trip_items_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES public.trips(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trip_publications trip_publications_publisherId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.trip_publications
    ADD CONSTRAINT "trip_publications_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trip_publications trip_publications_tripId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.trip_publications
    ADD CONSTRAINT "trip_publications_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES public.trips(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trips trips_folderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT "trips_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES public.itinerary_folders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: trips trips_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT "trips_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: video_interactions video_interactions_tripId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.video_interactions
    ADD CONSTRAINT "video_interactions_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES public.trips(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: video_interactions video_interactions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aiyo
--

ALTER TABLE ONLY public.video_interactions
    ADD CONSTRAINT "video_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict cWHJer5957LgSQ8abSNAMPiuWJhh8EQ150ObHJG7w5i6cS0LpEVFr9OzxgA0i5P

