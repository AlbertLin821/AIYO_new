export type UserTravelPreference = {
  destination?: string;
  days?: number;
  preferences?: string[];
  travelStyle?: string;
  budget?: string;
  companions?: string[];
};

export type VideoCandidate = {
  videoId: string;
  title: string;
  description?: string;
  publishedAt?: string;
  viewCount?: number;
  likeCount?: number;
  city?: string;
  tags?: string[];
  duration?: string;
  channelTitle?: string;
};

export type ScoredVideo = VideoCandidate & {
  score: number;
  scoreBreakdown: {
    destinationScore: number;
    daysScore: number;
    preferenceScore: number;
    freshnessScore: number;
    popularityScore: number;
    diversityScore: number;
  };
};

function includesAny(text: string, terms: string[]): boolean {
  const normalized = text.toLowerCase();
  return terms.some((term) => term && normalized.includes(term.toLowerCase()));
}

function normalizeDaysTerms(days: number): string[] {
  const chinese = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][days];
  const nights = Math.max(0, days - 1);
  return [
    `${days}日遊`,
    `${days}天`,
    `${days}天${nights}夜`,
    chinese ? `${chinese}日遊` : "",
    chinese ? `${chinese}天${nights ? `${["", "一", "二", "三", "四", "五", "六", "七", "八", "九"][nights] || nights}夜` : ""}` : "",
  ].filter(Boolean);
}

function destinationScore(video: VideoCandidate, preference: UserTravelPreference): number {
  const destination = preference.destination?.trim();
  if (!destination) {
    return 50;
  }
  const haystack = `${video.title} ${video.description || ""}`;
  if (video.city === destination || includesAny(haystack, [destination])) {
    return 100;
  }
  if ((video.tags || []).some((tag) => tag === destination)) {
    return 80;
  }
  return 0;
}

function daysScore(video: VideoCandidate, preference: UserTravelPreference): number {
  if (!preference.days) {
    return 50;
  }
  const title = video.title;
  if (includesAny(title, normalizeDaysTerms(preference.days))) {
    return 100;
  }
  if (includesAny(title, ["多日遊", "懶人包", "行程", "攻略"])) {
    return 60;
  }
  if (/\d+\s*(日|天)|[一二三四五六七八九十]日遊/.test(title)) {
    return 0;
  }
  return 30;
}

function preferenceScore(video: VideoCandidate, preference: UserTravelPreference): number {
  const preferences = preference.preferences?.filter(Boolean) || [];
  if (preferences.length === 0) {
    return 50;
  }
  const haystack = `${video.title} ${video.description || ""} ${(video.tags || []).join(" ")}`;
  const matched = preferences.filter((item) => includesAny(haystack, [item])).length;
  return (matched / preferences.length) * 100;
}

function freshnessScore(video: VideoCandidate): number {
  if (!video.publishedAt) {
    return 50;
  }
  const published = Date.parse(video.publishedAt);
  if (!Number.isFinite(published)) {
    return 50;
  }
  const months = (Date.now() - published) / (1000 * 60 * 60 * 24 * 30);
  if (months <= 6) return 100;
  if (months <= 12) return 80;
  if (months <= 24) return 60;
  if (months <= 36) return 40;
  return 20;
}

function popularityScore(video: VideoCandidate): number {
  if (!video.viewCount || video.viewCount <= 0) {
    return 40;
  }
  return Math.min(100, Math.round((Math.log10(video.viewCount + 1) / 7) * 100));
}

function diversityScore(video: VideoCandidate): number {
  const text = `${video.title} ${video.tags?.join(" ") || ""}`;
  if (includesAny(text, ["美食", "古蹟", "親子", "自然", "景點", "文青", "夜市"])) {
    return 90;
  }
  return 60;
}

export function scoreVideoRecommendation(
  video: VideoCandidate,
  preference: UserTravelPreference,
): ScoredVideo {
  const scoreBreakdown = {
    destinationScore: destinationScore(video, preference),
    daysScore: daysScore(video, preference),
    preferenceScore: preferenceScore(video, preference),
    freshnessScore: freshnessScore(video),
    popularityScore: popularityScore(video),
    diversityScore: diversityScore(video),
  };
  const score =
    scoreBreakdown.destinationScore * 0.35 +
    scoreBreakdown.daysScore * 0.15 +
    scoreBreakdown.preferenceScore * 0.25 +
    scoreBreakdown.freshnessScore * 0.1 +
    scoreBreakdown.popularityScore * 0.1 +
    scoreBreakdown.diversityScore * 0.05;

  return {
    ...video,
    score: Math.round(score * 10) / 10,
    scoreBreakdown,
  };
}

export function rankRecommendedVideos(
  videos: VideoCandidate[],
  preference: UserTravelPreference,
  limit = 6,
): ScoredVideo[] {
  const cityCounts = new Map<string, number>();
  return videos
    .map((video) => {
      const scored = scoreVideoRecommendation(video, preference);
      const city = video.city || "unknown";
      const seen = cityCounts.get(city) || 0;
      cityCounts.set(city, seen + 1);
      return {
        ...scored,
        score: Math.max(0, Math.round((scored.score - seen * 3) * 10) / 10),
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit));
}
