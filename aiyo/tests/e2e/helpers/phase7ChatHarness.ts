import type { Page } from "@playwright/test";
import type { Phase7TokyoSeed } from "./db";

type HarnessReply = {
  content: string;
  responseType?: string;
  questionCard?: {
    response_type: "question_card";
    title: string;
    description: string;
    questions: Array<{
      slot: string;
      question: string;
      type: string;
      options?: Array<{ label: string; value: string; recommended?: boolean }>;
    }>;
    action: { label: string; shortcut: string };
  };
  statusSteps?: Array<{
    type: "status_step";
    phase: string;
    label: string;
    status: string;
    provider?: string;
    query?: string;
    detail?: string;
  }>;
  assistantActions?: Array<{ type: string; payload: Record<string, unknown> }>;
  proposedChanges?: unknown[];
  travelAgentDecision?: {
    mode: string;
    preferenceConfirmation?: {
      summary: string;
      preferences: Record<string, unknown>;
      prompt: string;
    };
  };
};

function buildChatSuccess(reply: HarnessReply) {
  return {
    success: true,
    data: {
      reply: {
        id: `e2e_phase7_${Date.now()}`,
        role: "assistant",
        content: reply.content,
        timestamp: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }),
        responseType: reply.responseType || "general",
        statusSteps: reply.statusSteps,
        questionCard: reply.questionCard,
      },
      assistantActions: reply.assistantActions || [],
      proposedChanges: reply.proposedChanges || [],
      travelAgentDecision: reply.travelAgentDecision,
    },
  };
}

type ChatRouteBody = {
  message?: string;
  context?: {
    itinerary?: Array<{
      dayNumber: number;
      items: Array<{ id: string; title: string }>;
    }>;
  };
};

function dayItemsFromContext(body: ChatRouteBody | undefined, dayNumber: number) {
  return body?.context?.itinerary?.find((day) => day.dayNumber === dayNumber)?.items || [];
}

function isReorderMessage(text: string): boolean {
  return /第二天.*順序|順序.*第二天|把第二天順序改成/.test(text.trim());
}

async function fetchLiveDayItems(page: Page, dayNumber: number): Promise<Array<{ id: string; title: string }>> {
  return page.evaluate(async (targetDay) => {
    const response = await fetch("/api/bootstrap", { cache: "no-store", credentials: "same-origin" });
    const json = await response.json();
    const day = (json.data?.trip?.itinerary || []).find(
      (candidate: { dayNumber: number }) => candidate.dayNumber === targetDay,
    );
    return (day?.items || []).map((item: { id: string; title: string }) => ({
      id: item.id,
      title: item.title,
    }));
  }, dayNumber);
}

function buildReorderScenario(
  day2Items: Array<{ id: string; title: string }>,
  seed: Phase7TokyoSeed,
): HarnessReply {
  const ginzaItem = day2Items.find((item) => item.title.includes("銀座"));
  const skytreeItem = day2Items.find((item) => /晴空塔/.test(item.title));
  const akihabaraItem = day2Items.find((item) => item.id === seed.itemIds.day2Akihabara);
  const ginzaId = ginzaItem?.id || seed.itemIds.day2Ginza;
  const skytreeId = skytreeItem?.id || akihabaraItem?.id || seed.itemIds.day2Akihabara;
  return {
    content: "好的，第二天順序已調整為銀座、東京晴空塔。",
    responseType: "itinerary_update",
    assistantActions: [
      {
        type: "itinerary.reorder_items",
        payload: {
          dayId: "day-2",
          orderedItemIds: [ginzaId, skytreeId],
        },
      },
    ],
  };
}

function resolveScenario(message: string, seed: Phase7TokyoSeed, body?: ChatRouteBody): HarnessReply | null {
  const text = message.trim();

  if (/^你好/.test(text)) {
    return {
      content: "你好！我是你的旅遊助理，今天想聊什麼呢？",
      responseType: "general",
    };
  }

  if (/嘉義.*(三天|3天|三天兩夜)/.test(text) && /四個人|4\s*個人|總共\s*4/.test(text)) {
    return {
      content:
        "嘉義三天兩夜、四個人聽起來很棒！我找到可沿用的偏好：美食、coffee、night view、購物、適中步調、Transit。這次也要沿用嗎？",
      responseType: "text_message",
      travelAgentDecision: {
        mode: "confirm_preferences",
        preferenceConfirmation: {
          summary: "美食、coffee、night view、購物、適中步調、Transit",
          preferences: {
            budgetLevel: "medium",
            travelStyle: ["美食", "coffee", "night view", "購物"],
            pace: "balanced",
            transportPreference: "transit",
            destination: "嘉義",
            days: 3,
          },
          prompt: "這次嘉義 3 天也要沿用這些設定嗎？",
        },
      },
    };
  }

  if (/東京.*(三天|3天)/.test(text) || /去東京玩/.test(text)) {
    return {
      content:
        "東京三天聽起來很棒！我看到你先前偏好中等預算、美食與購物、步調適中。要沿用這些偏好來規劃嗎？",
      responseType: "text_message",
      travelAgentDecision: {
        mode: "confirm_preferences",
        preferenceConfirmation: {
          summary: "中等預算、美食、購物、適中步調",
          preferences: {
            budgetLevel: "medium",
            travelStyle: ["美食", "購物"],
            pace: "moderate",
            transportPreference: "地鐵與步行",
          },
          prompt: "要沿用這些偏好來規劃東京三天嗎？",
        },
      },
    };
  }

  if (/沿用/.test(text) && /輕鬆|relax/i.test(text)) {
    return {
      content: "好的，我會沿用中等預算與美食、購物偏好，並把步調調整為較輕鬆的節奏，開始準備東京三天行程。",
      responseType: "general",
    };
  }

  if (/沿用/.test(text) && /嘉義/.test(text)) {
    return {
      content: "收到，我再確認嘉義出發日期後就開始規劃。",
      responseType: "question_card",
      questionCard: {
        response_type: "question_card",
        title: "再確認一下嘉義行程偏好",
        description: "選好後我會依你的偏好繼續規劃。",
        questions: [
          {
            slot: "travel_dates",
            question: "嘉義預計哪幾天出發？",
            type: "date_range",
          },
        ],
        action: { label: "送出並繼續", shortcut: "Enter" },
      },
    };
  }

  if (/^沿用/.test(text) || /沿用先前偏好/.test(text)) {
    return {
      content: "好的，我會沿用中等預算與美食、購物偏好，開始準備東京三天行程。",
      responseType: "general",
    };
  }

  if (/晴空塔.*營業|營業.*晴空塔/.test(text)) {
    return {
      content: "我查了一下，東京晴空塔今天通常營業到 22:00，實際以現場公告為準。",
      responseType: "general",
      statusSteps: [
        {
          type: "status_step",
          phase: "web_search",
          label: "搜尋營業資訊",
          status: "completed",
          provider: "serper",
          query: "東京晴空塔 營業時間",
        },
      ],
    };
  }

  if (/第一次自由行/.test(text)) {
    return {
      content: "東京很適合第一次自由行，大眾運輸清楚、美食選擇多，也適合邊走邊調整節奏。",
      responseType: "general",
    };
  }

  if (/秋葉原.*(改成|改為).*晴空塔/.test(text)) {
    const day2Items = dayItemsFromContext(body, 2);
    const akihabaraItem =
      day2Items.find((item) => item.title.includes("秋葉原")) ||
      day2Items.find((item) => item.id === seed.itemIds.day2Akihabara);
    const itemId = akihabaraItem?.id || seed.itemIds.day2Akihabara;
    return {
      content: "沒問題，我已把第二天的秋葉原改成東京晴空塔。",
      responseType: "itinerary_update",
      assistantActions: [
        {
          type: "itinerary.update_item",
          payload: {
            dayId: "day-2",
            itemId,
            patch: { title: "東京晴空塔", location: "東京晴空塔" },
          },
        },
      ],
      proposedChanges: [
        {
          type: "update_itinerary_item",
          day: 2,
          itemId,
          title: "東京晴空塔",
          locationName: "東京晴空塔",
        },
      ],
    };
  }

  if (/晴空塔.*第一天.*下午|第一天.*下午.*晴空塔/.test(text)) {
    return {
      content: "已把東京晴空塔加到第一天下午。",
      responseType: "itinerary_update",
      assistantActions: [
        {
          type: "itinerary.add_item",
          payload: {
            dayId: "day-1",
            item: { title: "東京晴空塔", location: "東京晴空塔", startTime: "14:00" },
          },
        },
      ],
    };
  }

  if (isReorderMessage(text)) {
    const day2Items = dayItemsFromContext(body, 2);
    return buildReorderScenario(day2Items, seed);
  }

  if (/地圖.*清水寺|定位.*清水寺/.test(text)) {
    return {
      content: "已幫你把地圖焦點移到清水寺，這不會加入行程。",
      responseType: "general",
      assistantActions: [
        {
          type: "map.focus_location",
          payload: {
            placeName: "清水寺",
            zoom: 15,
          },
        },
      ],
    };
  }

  return null;
}

function geocodeMockResponse(query: string) {
  const normalized = query.trim().toLowerCase();
  if (/skytree|晴空塔/.test(normalized)) {
    return {
      success: true,
      data: {
        place: {
          placeName: "東京晴空塔",
          formattedAddress: "1 Chome Oshiage, Sumida City, Tokyo",
          placeId: "e2e-skytree",
          lat: 35.7101,
          lng: 139.8107,
          provider: "google-geocoding",
        },
      },
    };
  }
  if (/清水寺|kiyomizu/.test(normalized)) {
    return {
      success: true,
      data: {
        place: {
          placeName: "清水寺",
          formattedAddress: "Kyoto",
          placeId: "e2e-kiyomizu",
          lat: 34.9949,
          lng: 135.785,
          provider: "google-geocoding",
        },
      },
    };
  }
  if (/聖水|seongsu/.test(normalized)) {
    return {
      success: true,
      data: {
        place: {
          placeName: "聖水洞",
          formattedAddress: "Seongsu-dong, Seoul",
          placeId: "e2e-seongsu",
          lat: 37.5447,
          lng: 127.0559,
          provider: "google-geocoding",
        },
      },
    };
  }
  return {
    success: false,
    error: { code: "not_found", message: "E2E geocode mock miss" },
  };
}

export async function registerPhase7ChatHarness(page: Page, seed: Phase7TokyoSeed) {
  await page.unroute("**/api/places/geocode").catch(() => {});
  await page.route("**/api/places/geocode", async (route) => {
    const body = route.request().postDataJSON() as { query?: string };
    const payload = geocodeMockResponse(String(body.query || ""));
    await route.fulfill({
      status: payload.success ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  await page.unroute("**/api/ai/chat").catch(() => {});
  await page.route("**/api/ai/chat", async (route) => {
    const body = route.request().postDataJSON() as ChatRouteBody;
    const message = body.message || "";
    const text = message.trim();

    if (isReorderMessage(text)) {
      const contextItems = dayItemsFromContext(body, 2);
      const liveItems = contextItems.length >= 2 ? [] : await fetchLiveDayItems(page, 2);
      const day2Items = contextItems.length >= 2 ? contextItems : liveItems;
      const scenario = buildReorderScenario(day2Items, seed);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildChatSuccess(scenario)),
      });
      return;
    }

    const scenario = resolveScenario(message, seed, body);
    if (!scenario) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildChatSuccess(scenario)),
    });
  });
}

export async function isLiveAiAvailable(page: Page): Promise<boolean> {
  if (process.env.E2E_LIVE_AI !== "1") {
    return false;
  }
  const probe = await page.evaluate(async () => {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "ping" }),
    });
    return { ok: response.ok, status: response.status };
  });
  return probe.ok;
}
