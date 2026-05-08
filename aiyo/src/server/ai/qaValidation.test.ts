import assert from "node:assert/strict";
import test from "node:test";
import { parseTripPlanResponse, parseVideoSummaryResponse } from "@/server/ai/responseParser";
import type { TripPlanRequest, TripPlanResult, VideoSummarySegment } from "@/types";

const allowedTypes = new Set(["attraction", "restaurant", "transport", "hotel", "activity", "shopping"]);

function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function validateItineraryShape(plan: TripPlanResult, request: TripPlanRequest) {
  assert.ok(plan.summary.length > 0);
  assert.equal(plan.days.length, request.days);

  for (const [dayIndex, day] of plan.days.entries()) {
    assert.equal(day.dayNumber, dayIndex + 1);
    assert.ok(day.items.length >= 4 && day.items.length <= 7);
    const seenTitles = new Set<string>();

    day.items.forEach((item, itemIndex) => {
      assert.ok(item.id);
      assert.match(item.time, /^\d{2}:\d{2}$/);
      assert.ok(item.title);
      assert.ok(allowedTypes.has(item.type));
      assert.ok(!seenTitles.has(item.title), `duplicate item ${item.title}`);
      seenTitles.add(item.title);
      if (itemIndex > 0) {
        assert.ok(minutes(day.items[itemIndex - 1].time) <= minutes(item.time), "times should be chronological");
      }
      if (item.location) {
        assert.ok(item.location.name);
        assert.ok(Number.isFinite(item.location.lat));
        assert.ok(Number.isFinite(item.location.lng));
        assert.ok(Math.abs(item.location.lat) <= 90);
        assert.ok(Math.abs(item.location.lng) <= 180);
        assert.notEqual(item.location.name, request.destination);
      }
    });
  }
}

test("fixture itinerary for Chiayi passes structural and travel-data validation", () => {
  const request: TripPlanRequest = {
    destination: "嘉義",
    days: 2,
    preferences: {
      interests: ["美食", "景點", "在地文化"],
      pace: "moderate",
      transportPreference: "walk/train/mixed",
    },
  };

  const raw = JSON.stringify({
    summary: "嘉義兩日以在地小吃、老屋文化與阿里山森林鐵路脈絡安排。",
    days: [
      {
        dayNumber: 1,
        theme: "市區美食與文化",
        items: [
          {
            id: "d1-1",
            time: "09:00",
            title: "嘉義公園",
            type: "attraction",
            location: { name: "嘉義公園", lat: 23.4816, lng: 120.4671, description: "市區公園", address: "嘉義市東區" },
          },
          {
            id: "d1-2",
            time: "11:30",
            title: "阿宏師火雞肉飯",
            type: "restaurant",
            location: { name: "阿宏師火雞肉飯", lat: 23.4784, lng: 120.4492, description: "火雞肉飯", address: "嘉義市" },
          },
          {
            id: "d1-3",
            time: "14:00",
            title: "檜意森活村",
            type: "attraction",
            location: { name: "檜意森活村", lat: 23.4851, lng: 120.4538, description: "日式木造建築群", address: "嘉義市東區林森東路1號" },
          },
          {
            id: "d1-4",
            time: "18:00",
            title: "文化路夜市",
            type: "shopping",
            location: { name: "文化路夜市", lat: 23.4777, lng: 120.4498, description: "夜市小吃", address: "嘉義市東區文化路" },
          },
        ],
      },
      {
        dayNumber: 2,
        theme: "市場與經典小吃",
        items: [
          {
            id: "d2-1",
            time: "09:00",
            title: "東市場",
            type: "shopping",
            location: { name: "東市場", lat: 23.4782, lng: 120.4542, description: "傳統市場早餐", address: "嘉義市東區" },
          },
          {
            id: "d2-2",
            time: "11:30",
            title: "林聰明砂鍋魚頭",
            type: "restaurant",
            location: { name: "林聰明砂鍋魚頭", lat: 23.4773, lng: 120.4496, description: "砂鍋魚頭", address: "嘉義市東區中正路361號" },
          },
          {
            id: "d2-3",
            time: "14:00",
            title: "北門驛",
            type: "attraction",
            location: { name: "北門驛", lat: 23.4863, lng: 120.4546, description: "森林鐵路車站", address: "嘉義市東區共和路428號" },
          },
          {
            id: "d2-4",
            time: "16:30",
            title: "射日塔",
            type: "attraction",
            location: { name: "射日塔", lat: 23.4819, lng: 120.4699, description: "城市景觀", address: "嘉義市東區公園街46號" },
          },
        ],
      },
    ],
  });

  const parsed = parseTripPlanResponse(raw, request);
  validateItineraryShape(parsed.result, request);
});

test("video summary fixture keeps timestamped concrete places from transcript", () => {
  const fallbackSegments: VideoSummarySegment[] = [];
  const parsed = parseVideoSummaryResponse(
    JSON.stringify({
      title: "嘉義美食一日遊",
      summary: "嘉義市區小吃與夜市路線。",
      segments: [
        {
          timestamp: "03:20",
          startSeconds: 200,
          endSeconds: 250,
          title: "阿宏師火雞肉飯",
          text: "這段介紹火雞肉飯的雞油香氣與排隊方式。",
          highlights: ["雞油香氣", "午餐排隊"],
          locationHints: ["阿宏師火雞肉飯"],
        },
        {
          timestamp: "08:10",
          startSeconds: 490,
          endSeconds: 550,
          title: "林聰明砂鍋魚頭",
          text: "這段介紹砂鍋魚頭湯頭與適合用餐時間。",
          highlights: ["湯頭", "熱門用餐時段"],
          locationHints: ["林聰明砂鍋魚頭"],
        },
        {
          timestamp: "13:00",
          startSeconds: 780,
          endSeconds: 850,
          title: "文化路夜市",
          text: "傍晚轉往夜市，整理晚餐後可步行的小吃點。",
          highlights: ["夜市散步", "晚餐小吃"],
          locationHints: ["文化路夜市"],
        },
      ],
      extractedLocations: ["嘉義", "嘉義美食", "阿宏師火雞肉飯", "林聰明砂鍋魚頭", "文化路夜市"],
    }),
    {
      title: "fallback",
      summary: "",
      segments: fallbackSegments,
      extractedLocations: [],
    },
  );

  assert.equal(parsed.parseFailed, false);
  assert.equal(parsed.segments.length, 3);
  for (const segment of parsed.segments) {
    assert.match(segment.timestamp, /^\d{2}:\d{2}$/);
    assert.ok(typeof segment.startSeconds === "number");
    assert.ok(typeof segment.endSeconds === "number");
    assert.ok((segment.endSeconds || 0) > (segment.startSeconds || 0));
    assert.ok(segment.title);
    assert.ok(segment.text);
    assert.ok(segment.highlights?.length);
    assert.ok(segment.locationHints?.length);
  }
});

