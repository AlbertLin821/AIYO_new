"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  MessageCircle,
  RefreshCw,
  ThumbsUp,
} from "lucide-react";
import { AnimatePresence, m } from "@/lib/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import TravelArticlesPlaneLoading from "@/components/home/TravelArticlesPlaneLoading";
import { fetchTravelArticles } from "@/services/travelArticlesClient";
import type { TravelArticle } from "@/types/travelArticle";

const COLLAPSED_COUNT = 4;
const FETCH_LIMIT = 8;

type HomeTravelArticlesSectionProps = {
  query?: string;
  className?: string;
};

function formatPublishedAt(value?: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString("zh-TW", {
    month: "short",
    day: "numeric",
  });
}

function sourceBadgeClass(source: TravelArticle["source"]): string {
  return source === "dcard"
    ? "bg-[#006aa6]/12 text-[#006aa6] hover:bg-[#006aa6]/12"
    : "bg-primary/12 text-primary hover:bg-primary/12";
}

function TravelArticleCard({ article, index }: { article: TravelArticle; index: number }) {
  return (
    <m.a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ delay: index * 0.04 }}
      data-testid={`travel-article-${article.id}`}
      className="group flex h-full flex-col rounded-2xl border border-border-light bg-white p-4 shadow-soft transition-colors hover:border-primary/25 hover:bg-surface-elevated"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <Badge variant="secondary" className={sourceBadgeClass(article.source)}>
          {article.sourceLabel}
        </Badge>
        <ExternalLink
          className="size-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </div>
      <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-primary">
        {article.title}
      </h3>
      <p className="mt-2 line-clamp-3 flex-1 text-xs leading-relaxed text-muted">{article.excerpt}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-muted-light">
        {formatPublishedAt(article.publishedAt) ? (
          <span>{formatPublishedAt(article.publishedAt)}</span>
        ) : null}
        {typeof article.likeCount === "number" ? (
          <span className="inline-flex items-center gap-1">
            <ThumbsUp className="size-3" aria-hidden />
            {article.likeCount}
          </span>
        ) : null}
        {typeof article.commentCount === "number" ? (
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="size-3" aria-hidden />
            {article.commentCount}
          </span>
        ) : null}
      </div>
    </m.a>
  );
}

export default function HomeTravelArticlesSection({
  query = "",
  className,
}: HomeTravelArticlesSectionProps) {
  const [articles, setArticles] = useState<TravelArticle[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [refreshSeed, setRefreshSeed] = useState(0);

  const loadArticles = useCallback(
    async (options: { seed: number; refreshing: boolean; excludeIds?: string[] }) => {
      if (options.refreshing) {
        setIsRefreshing(true);
        setErrorMessage(null);
      } else {
        setIsLoading(true);
        setErrorMessage(null);
        setIsExpanded(false);
      }

      try {
        const result = await fetchTravelArticles({
          query,
          limit: FETCH_LIMIT,
          refreshSeed: options.seed,
          excludeIds: options.excludeIds,
        });
        setArticles(result.articles);
        setSources(result.sources);
      } catch (error) {
        if (!options.refreshing) {
          setArticles([]);
          setSources([]);
        }
        setErrorMessage(error instanceof Error ? error.message : t.home.travelArticlesError);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [query],
  );

  useEffect(() => {
    setRefreshSeed(0);
    void loadArticles({ seed: 0, refreshing: false });
  }, [loadArticles]);

  const handleRefresh = () => {
    const nextSeed = refreshSeed + 1;
    setRefreshSeed(nextSeed);
    setIsExpanded(false);
    void loadArticles({
      seed: nextSeed,
      refreshing: true,
      excludeIds: articles.map((article) => article.id),
    });
  };

  const visibleArticles = isExpanded ? articles : articles.slice(0, COLLAPSED_COUNT);
  const canToggle = articles.length > COLLAPSED_COUNT;
  const showSkeleton = isLoading || isRefreshing;
  const showGrid = !isLoading && !errorMessage && articles.length > 0;

  return (
    <section
      className={cn("mx-auto max-w-6xl", className)}
      data-testid="home-travel-articles-section"
      aria-labelledby="home-travel-articles-title"
      aria-busy={showSkeleton}
    >
      <div className="mb-5 flex flex-wrap items-center gap-2 px-1">
        <FileText className="size-4 text-primary" aria-hidden />
        <h2 id="home-travel-articles-title" className="font-semibold text-foreground">
          {t.home.travelArticlesTitle}
        </h2>
        {!isLoading && sources.length > 0 ? (
          <Badge variant="secondary" className="bg-border-light text-muted hover:bg-border-light">
            {sources.slice(0, 3).join(" · ")}
          </Badge>
        ) : null}
        {showGrid ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={showSkeleton}
            className="ml-auto rounded-full border-border-light bg-surface shadow-soft hover:bg-primary/10"
            data-testid="travel-articles-refresh"
            aria-label={t.home.travelArticlesRefresh}
          >
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} aria-hidden />
            {isRefreshing ? t.home.travelArticlesRefreshing : t.home.travelArticlesRefresh}
          </Button>
        ) : null}
      </div>

      {showSkeleton ? (
        <TravelArticlesPlaneLoading />
      ) : errorMessage ? (
        <Card className="rounded-2xl border-dashed border-border-light bg-cream/40 py-0 shadow-none">
          <CardContent className="px-6 py-12 text-center text-sm text-muted">{errorMessage}</CardContent>
        </Card>
      ) : articles.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-border-light bg-cream/40 py-0 shadow-none">
          <CardContent className="px-6 py-12 text-center">
            <p className="text-base font-medium text-foreground">{t.home.travelArticlesEmptyTitle}</p>
            <p className="mt-2 text-sm text-muted">{t.home.travelArticlesEmptyHint}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {visibleArticles.map((article, index) => (
                <TravelArticleCard key={`${refreshSeed}-${article.id}`} article={article} index={index} />
              ))}
            </AnimatePresence>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {canToggle ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsExpanded((value) => !value)}
                className="rounded-full border-border-light bg-surface px-5 shadow-soft hover:bg-primary/10"
                data-testid="travel-articles-toggle"
                aria-expanded={isExpanded}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="size-3.5" aria-hidden />
                    {t.home.travelArticlesShowLess}
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3.5" aria-hidden />
                    {t.home.travelArticlesShowMore}
                  </>
                )}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
