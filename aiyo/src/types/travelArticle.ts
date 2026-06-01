export type TravelArticleSource = "dcard" | "blog";

export type TravelArticle = {
  id: string;
  title: string;
  excerpt: string;
  url: string;
  source: TravelArticleSource;
  sourceLabel: string;
  publishedAt?: string;
  likeCount?: number;
  commentCount?: number;
};

export type TravelArticlesResult = {
  articles: TravelArticle[];
  sources: string[];
  fallbackUsed: boolean;
};
