export type SourceType =
  | "youtube"
  | "website"
  | "google_place"
  | "user_upload"
  | "system"
  | "unknown";

export type SourceReference = {
  id: string;
  type: SourceType;
  title: string;
  url?: string;
  snippet?: string;
  thumbnailUrl?: string;
  provider?: string;
  retrievedAt?: string;
  confidence?: number;

  youtube?: {
    videoId: string;
    channelTitle?: string;
    startSeconds?: number;
    endSeconds?: number;
    timestampLabel?: string;
    transcriptText?: string;
    /** 影片段落主題（對應 VideoSummarySegment.title） */
    segmentTitle?: string;
    /** 段落內提到的地點／地景提示 */
    locationHints?: string[];
  };

  website?: {
    siteName?: string;
    publishedAt?: string;
    author?: string;
    canonicalUrl?: string;
  };

  googlePlace?: {
    placeId: string;
    name: string;
    address?: string;
    rating?: number;
    userRatingCount?: number;
    lat?: number;
    lng?: number;
  };

  userUpload?: {
    fileId: string;
    fileName: string;
    pageNumber?: number;
    chunkIndex?: number;
  };
};
