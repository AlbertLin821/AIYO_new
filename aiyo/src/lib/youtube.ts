export type VideoTimestamp = {
  time: string;
  seconds: number;
  title: string;
  description: string;
};

export type VideoSummary = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  summary: string;
  timestamps: VideoTimestamp[];
};

const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{6,}$/;

export function extractYouTubeVideoId(url: string): string | null {
  const input = url.trim();
  if (!input) {
    return null;
  }

  if (YOUTUBE_ID_PATTERN.test(input) && !input.includes("/") && !input.includes(".")) {
    return input;
  }

  try {
    const parsed = new URL(input.startsWith("http") ? input : `https://${input}`);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return parsed.pathname.split("/").filter(Boolean)[0] || null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/")[2] || null;
      }
      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/")[2] || null;
      }
    }
  } catch {
    return null;
  }

  return null;
}
