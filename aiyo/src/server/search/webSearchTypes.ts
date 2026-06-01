export type WebSearchResult = {
  title: string;
  url: string;
  content: string;
  engine?: string;
  score?: number;
  publishedDate?: string | null;
};

export type WebSearchOptions = {
  query: string;
  language?: string;
  categories?: string;
  limit?: number;
  safeSearch?: number;
  /** Serper pagination starts at 1; other providers may ignore it. */
  page?: number;
};
