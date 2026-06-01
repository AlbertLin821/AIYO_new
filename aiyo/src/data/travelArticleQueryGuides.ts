import type { TravelArticle } from "@/types/travelArticle";

/** Dcard 從伺服器常被擋；改導向站內搜尋頁，讓使用者看到與關鍵字相關的貼文。 */
export function buildQueryGuidedArticles(query: string): TravelArticle[] {
  const keyword = query.trim();
  if (!keyword) {
    return [];
  }

  const dcardQuery = encodeURIComponent(`${keyword} 旅遊`);
  const backpackersQuery = encodeURIComponent(keyword);

  const idKey = keyword.replace(/\s+/g, "-").toLowerCase();

  return [
    {
      id: `guide-dcard-search-${idKey}`,
      title: `Dcard：「${keyword}」旅遊討論`,
      excerpt: `在 Dcard 旅遊相關貼文中搜尋「${keyword}」，查看行程、美食與住宿心得。`,
      url: `https://www.dcard.tw/search/posts?query=${dcardQuery}`,
      source: "dcard",
      sourceLabel: "Dcard 搜尋",
    },
    {
      id: `guide-backpackers-search-${idKey}`,
      title: `背包客棧：「${keyword}」相關討論`,
      excerpt: `在背包客棧論壇搜尋「${keyword}」，瀏覽自由行與行程分享。`,
      url: `https://www.backpackers.com.tw/forum/search.php?keywords=${backpackersQuery}`,
      source: "blog",
      sourceLabel: "背包客棧",
    },
    {
      id: `guide-dcard-topic-${idKey}`,
      title: `Dcard 主題：#${keyword}`,
      excerpt: `依主題標籤瀏覽與「${keyword}」相關的最新旅遊貼文。`,
      url: `https://www.dcard.tw/topics/${encodeURIComponent(keyword)}?latest=true`,
      source: "dcard",
      sourceLabel: "Dcard 主題",
    },
  ];
}
