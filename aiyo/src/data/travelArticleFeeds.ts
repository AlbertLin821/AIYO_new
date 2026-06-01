export type TravelRssFeedConfig = {
  id: string;
  label: string;
  url: string;
};

export const DCARD_TRAVEL_FORUMS = [
  { alias: "travel", label: "Dcard 旅遊" },
  { alias: "journey", label: "Dcard 旅遊分享" },
] as const;

export const TRAVEL_RSS_FEEDS: TravelRssFeedConfig[] = [
  {
    id: "backpackers",
    label: "背包客棧",
    url: "https://www.backpackers.com.tw/feed/",
  },
  {
    id: "carol-travel",
    label: "部落格",
    url: "https://carol25168.pixnet.net/blog/rss",
  },
];
