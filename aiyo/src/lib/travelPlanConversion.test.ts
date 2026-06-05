import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyTextItineraryCorrections,
  ensureTripPlanDayCount,
  parseDayLabelToNumber,
  textItineraryToTripPlanResult,
  travelPlanResponseToTripPlanResult,
  tripPlanHasItems,
} from "@/lib/travelPlanConversion";
import type { TravelPlanResponse } from "@/types";

const samplePlan: TravelPlanResponse = {
  response_type: "travel_plan",
  title: "東京3天2夜",
  summary_table: [],
  days: [
    {
      day: "Day 1",
      theme: "淺草與晴空塔",
      transportation: [],
      spots: [
        { name: "淺草寺", feature: "早午餐前散步" },
        { name: "東京晴空塔", feature: "展望台" },
      ],
      food_recommendations: [{ name: "大黑家天婦羅", description: "炸蝦飯" }],
      tips: [],
    },
    {
      day: "第2天",
      theme: "澀谷",
      transportation: [],
      spots: [{ name: "明治神宮", feature: "森林步道" }],
      food_recommendations: [],
      tips: [],
    },
    {
      day: "Day 3",
      theme: "返程",
      transportation: [],
      spots: [],
      food_recommendations: [{ name: "築地場外市場", description: "收尾採買" }],
      tips: [],
    },
  ],
  weather_alerts: [],
  event_alerts: [],
  assumptions: [],
};

test("parseDayLabelToNumber handles Day, 第N天, and numeric labels", () => {
  assert.equal(parseDayLabelToNumber("Day 3", 0), 3);
  assert.equal(parseDayLabelToNumber("第2天", 0), 2);
  assert.equal(parseDayLabelToNumber("3", 0), 3);
  assert.equal(parseDayLabelToNumber(undefined, 4), 5);
});

test("travelPlanResponseToTripPlanResult maps spots and food into items", () => {
  const result = travelPlanResponseToTripPlanResult(samplePlan, { targetDayCount: 3 });

  assert.equal(result.days.length, 3);
  assert.equal(result.days[0]?.items[0]?.title, "淺草寺");
  assert.equal(result.days[0]?.items[0]?.type, "attraction");
  assert.equal(result.days[0]?.items[0]?.location?.name, "淺草寺");
  assert.equal(result.days[0]?.items[2]?.title, "大黑家天婦羅");
  assert.equal(result.days[0]?.items[2]?.type, "restaurant");
  assert.equal(result.days[0]?.items[2]?.location?.name, "大黑家天婦羅");
  assert.equal(result.days[2]?.items[0]?.title, "築地場外市場");
  assert.ok(tripPlanHasItems(result));
});

test("ensureTripPlanDayCount pads empty middle days", () => {
  const sparse = travelPlanResponseToTripPlanResult({
    ...samplePlan,
    days: [samplePlan.days[0]!, samplePlan.days[2]!],
  });
  const padded = ensureTripPlanDayCount(sparse, 3);

  assert.equal(padded.days.length, 3);
  assert.equal(padded.days[1]?.dayNumber, 2);
  assert.equal(padded.days[1]?.items.length, 0);
  assert.equal(padded.days[0]?.items.length, 3);
});

test("textItineraryToTripPlanResult converts assistant day-by-day prose into editable items", () => {
  const result = textItineraryToTripPlanResult(
    `
**Day 1：抵達首爾 & 漢江初體驗**
- **下午**：抵達仁川/金浦機場，搭乘計程車前往酒店辦理入住。
- **傍晚**：前往**漢江公園（Yeouido 段）**，欣賞漢江夕陽。
- **晚餐**：推薦**明洞**或**弘大**的韓式烤肉。
- **住宿**：建議住在**明洞**附近。

**Day 2：傳統韓屋 & 主題樂園樂趣**
- **上午**：前往**北村韓屋村**。
- **下午**：前往**樂天世界（Lotte World）**。
- **晚餐**：推薦**廣藏市場**附近的韓式料理。
`,
    { targetDayCount: 3 },
  );

  assert.ok(result);
  assert.equal(result.days.length, 3);
  assert.equal(result.days[0]?.items[0]?.title, "金浦機場");
  assert.equal(result.days[0]?.items[1]?.title, "漢江公園");
  assert.equal(result.days[0]?.items[2]?.title, "明洞");
  assert.equal(result.days[1]?.items[0]?.title, "北村韓屋村");
  assert.equal(result.days[1]?.items[1]?.title, "樂天世界");
  assert.equal(result.days[2]?.items.length, 0);
});

test("applyTextItineraryCorrections applies later assistant replacements", () => {
  const result = textItineraryToTripPlanResult(
    `
*   **Day 1：抵達與自然初體驗**
    *   下午前往**海龍宮寺**（自然景觀）。
    *   晚餐：推薦**串炸**或**大阪燒**。
`,
  );
  assert.ok(result);

  const corrected = applyTextItineraryCorrections(result, [
    "收到！已將行程中的「海龍宮寺」替換為**大阪海遊館**。Day 1 下午將安排前往大阪海遊館。",
  ]);

  assert.equal(corrected.days[0]?.items[0]?.title, "大阪海遊館");
  assert.equal(corrected.days[0]?.items.some((item) => item.title === "Day 1"), false);
});

test("textItineraryToTripPlanResult also parses non-bulleted time-prefixed lines with quoted places", () => {
  const result = textItineraryToTripPlanResult(
    `
Day 1：抵達熊本
下午：入住後步行至「八木屋」品嚐拉麵。
晚上：前往「菊水公園」散步。

Day 2：阿蘇自然之旅
上午：前往「大觀峰展望所」。
下午：到「草千里之濱」散步。
`,
    { targetDayCount: 2 },
  );

  assert.ok(result);
  assert.equal(result.days.length, 2);
  assert.equal(result.days[0]?.items[0]?.title, "八木屋");
  assert.equal(result.days[0]?.items[1]?.title, "菊水公園");
  assert.equal(result.days[1]?.items[0]?.title, "大觀峰展望所");
  assert.equal(result.days[1]?.items[1]?.title, "草千里之濱");
});

test("textItineraryToTripPlanResult parses compact inline day prose separated by dashes and semicolons", () => {
  const result = textItineraryToTripPlanResult(
    `已直接替換。 Day 1：抵達熊本與市景初探 - 下午入住後前往「八木屋」；晚上去「菊水公園」。 Day 2：阿蘇自然之旅 - 上午前往「大觀峰展望所」；下午去「草千里之濱」。`,
    { targetDayCount: 2 },
  );

  assert.ok(result);
  assert.equal(result.days.length, 2);
  assert.equal(result.days[0]?.items[0]?.title, "八木屋");
  assert.equal(result.days[0]?.items[1]?.title, "菊水公園");
  assert.equal(result.days[1]?.items[0]?.title, "大觀峰展望所");
  assert.equal(result.days[1]?.items[1]?.title, "草千里之濱");
});

test("textItineraryToTripPlanResult skips generic fake-sounding park titles", () => {
  const result = textItineraryToTripPlanResult(
    `
Day 1：熊本市區
下午：前往文化公園散步，晚上再到「熊本城」。
`,
    { targetDayCount: 1 },
  );

  assert.ok(result);
  assert.equal(result.days[0]?.items.length, 1);
  assert.equal(result.days[0]?.items[0]?.title, "熊本城");
});
