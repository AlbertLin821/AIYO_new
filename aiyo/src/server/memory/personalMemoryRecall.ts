import { isPersonalMemoryRecallIntent } from "@/lib/chat/workflowRailVisibility";
import type { AIContextBuildResult } from "@/server/ai/aiContextBuilder";
import type { TripProfile } from "@/types";

export { isPersonalMemoryRecallIntent };

const MAX_USER_FACING_SNIPPET_CHARS = 280;

export type PersonalMemoryTripRecord = {
  title?: string;
  destination?: string;
  daysCount?: number;
  summary?: string;
  representativeItems?: string[];
  createdAt?: string;
};

export type PersonalMemoryBundle = {
  destinations: string[];
  snippets: string[];
  recentTrips: PersonalMemoryTripRecord[];
  hasData: boolean;
};

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function parseNumberedMemoryLines(memoryContext?: string): string[] {
  if (!memoryContext?.trim()) {
    return [];
  }
  return memoryContext
    .split("\n")
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

export function isUserFacingMemorySnippet(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_USER_FACING_SNIPPET_CHARS) {
    return false;
  }

  const internalPatterns = [
    /^\[[^\]]+\]/u,
    /^(assistant|user):\s/i,
    /^(analyze|watch):\s/i,
    /Context 限制提醒/u,
    /已省略/u,
    /省略.*內容/u,
    /本次輸入/u,
    /行程生成要求/u,
    /^目前行程/u,
    /^Day\s+\d+/iu,
    /地點=/u,
    /關聯行程=/u,
    /近期全域聊天摘要/u,
    /近期旅遊影片互動/u,
    /已套用影片摘要/u,
    /Mem0 長期記憶/u,
    /使用者偏好摘要/u,
    /近期歷史行程/u,
  ];

  return !internalPatterns.some((pattern) => pattern.test(trimmed));
}

function truncateSnippet(text: string, maxChars = 120): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars - 1)}…`;
}

function collectMem0Snippets(input: {
  mem0Memories?: string[];
  memoryContext?: string;
  aiContext?: AIContextBuildResult | null;
}): string[] {
  const structured = input.aiContext?.structuredContext;
  return dedupeStrings([
    ...(input.mem0Memories || []).filter(isUserFacingMemorySnippet),
    ...parseNumberedMemoryLines(input.memoryContext).filter(isUserFacingMemorySnippet),
    ...(structured?.memorySnippets || [])
      .filter((snippet) => snippet.source === "mem0")
      .map((snippet) => snippet.content)
      .filter(isUserFacingMemorySnippet),
  ]);
}

export function buildPersonalMemoryBundle(input: {
  aiContext?: AIContextBuildResult | null;
  memoryContext?: string;
  mem0Memories?: string[];
  tripProfile?: TripProfile | null;
}): PersonalMemoryBundle {
  const structured = input.aiContext?.structuredContext;
  const currentTrip = structured?.currentTrip;
  const destinations = dedupeStrings([
    currentTrip?.destination || "",
    ...(structured?.recentTrips.map((trip) => trip.destination || "").filter(Boolean) || []),
    ...(structured?.preferences.destinationPreferences || []),
    ...(input.tripProfile?.visited_before || []),
  ]);

  const snippets = collectMem0Snippets(input);

  const recentTrips: PersonalMemoryTripRecord[] = dedupeStrings([
    ...(currentTrip?.destination
      ? [
          JSON.stringify({
            title: currentTrip.title,
            destination: currentTrip.destination,
            daysCount: currentTrip.days.length,
            representativeItems: dedupeStrings(
              currentTrip.days.flatMap((day) => day.items.map((item) => item.title)),
            ).slice(0, 6),
          }),
        ]
      : []),
    ...((structured?.recentTrips || []).map((trip) =>
      JSON.stringify({
        title: trip.title,
        destination: trip.destination,
        daysCount: trip.daysCount,
        summary: trip.summary,
        representativeItems: trip.representativeItems,
        createdAt: trip.createdAt,
      }),
    ) || []),
  ]).map((row) => JSON.parse(row) as PersonalMemoryTripRecord);

  const tripsWithDestination = recentTrips.filter((trip) => trip.destination?.trim());

  return {
    destinations,
    snippets,
    recentTrips,
    hasData:
      destinations.length > 0 || tripsWithDestination.length > 0 || snippets.length > 0,
  };
}

export function formatPersonalMemoryBundleForPrompt(bundle: PersonalMemoryBundle): string {
  const sections: string[] = [];

  if (bundle.destinations.length) {
    sections.push(`已知去過或常去的目的地：${bundle.destinations.join("、")}`);
  }

  const tripsWithDestination = bundle.recentTrips.filter((trip) => trip.destination?.trim());
  if (tripsWithDestination.length) {
    sections.push(
      "近期歷史行程：",
      ...tripsWithDestination.map((trip) => {
        const parts = [
          trip.title || "未命名行程",
          trip.destination ? `目的地=${trip.destination}` : "",
          trip.daysCount ? `${trip.daysCount} 天` : "",
          trip.representativeItems?.length ? `代表項目=${trip.representativeItems.join("、")}` : "",
          trip.summary || "",
        ].filter(Boolean);
        return `- ${parts.join("；")}`;
      }),
    );
  }

  if (bundle.snippets.length) {
    sections.push(
      "Mem0 長期記憶片段：",
      ...bundle.snippets.map((snippet) => `- ${truncateSnippet(snippet)}`),
    );
  }

  return sections.join("\n").trim();
}

function selectRelevantTrips(bundle: PersonalMemoryBundle, query?: string): PersonalMemoryTripRecord[] {
  const tripsWithDestination = bundle.recentTrips.filter((trip) => trip.destination?.trim());
  if (!query?.trim()) {
    return tripsWithDestination;
  }

  const normalizedQuery = query.toLowerCase();
  const matched = tripsWithDestination.filter((trip) => {
    const haystacks = [trip.title || "", trip.destination || "", ...(trip.representativeItems || [])].map((value) =>
      value.toLowerCase(),
    );
    return haystacks.some((value) => value.includes(normalizedQuery) || normalizedQuery.includes(value));
  });

  return matched.length ? matched : tripsWithDestination;
}

export function formatPersonalMemoryDeterministicReply(bundle: PersonalMemoryBundle, query?: string): string {
  if (!bundle.hasData) {
    return "我這邊目前還沒有記錄到你去過的目的地。你可以直接告訴我過去去過哪裡，或開始規劃新行程，我會把偏好記下來。";
  }

  const lines: string[] = ["根據我目前記錄到的旅行資料，你去過或常提到的地方包括："];

  if (bundle.destinations.length) {
    lines.push(`- 目的地：${bundle.destinations.join("、")}`);
  }

  const tripsWithDestination = selectRelevantTrips(bundle, query);
  if (tripsWithDestination.length) {
    lines.push("- 近期行程：");
    for (const trip of tripsWithDestination.slice(0, 5)) {
      const label = trip.title || trip.destination || "未命名行程";
      const detail = [trip.destination, trip.daysCount ? `${trip.daysCount} 天` : ""]
        .filter(Boolean)
        .join("，");
      lines.push(`  - ${label}${detail ? `（${detail}）` : ""}`);
      if (trip.representativeItems?.length) {
        lines.push(`    去過／排過：${trip.representativeItems.slice(0, 6).join("、")}`);
      }
    }
  }

  if (bundle.snippets.length) {
    lines.push("- 其他偏好：");
    for (const snippet of bundle.snippets.slice(0, 3)) {
      lines.push(`  - ${truncateSnippet(snippet)}`);
    }
  }

  lines.push("如果想補充或修正，直接告訴我就好。");
  return lines.join("\n");
}
