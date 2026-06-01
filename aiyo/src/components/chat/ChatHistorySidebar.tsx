"use client";

import {
  ChevronLeft,
  ChevronRight,
  History,
  MessageSquarePlus,
  Plus,
  Trash2,
} from "lucide-react";
import { zhTW as t } from "@/locales/zh-TW";
import { cn } from "@/lib/utils";
import { CHAT_REMOTE_CONVERSATION_ID, type ChatConversation } from "@/stores/useChatStore";

type DateGroup = {
  label: string;
  sortKey: number;
  conversations: ChatConversation[];
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDateGroupLabel(date: Date): string {
  const now = startOfDay(new Date());
  const target = startOfDay(date);
  const diffDays = Math.floor((now.getTime() - target.getTime()) / 86_400_000);

  if (diffDays === 0) {
    return t.chat.dateGroupToday;
  }
  if (diffDays === 1) {
    return t.chat.dateGroupYesterday;
  }
  return date.toLocaleDateString("zh-TW", {
    month: "long",
    day: "numeric",
  });
}

function groupConversationsByDate(conversations: ChatConversation[]): DateGroup[] {
  const groups = new Map<string, DateGroup>();

  for (const conversation of conversations) {
    const date = new Date(conversation.updatedAt);
    const label = getDateGroupLabel(date);
    const sortKey = startOfDay(date).getTime();
    const existing = groups.get(label);

    if (existing) {
      existing.conversations.push(conversation);
    } else {
      groups.set(label, { label, sortKey, conversations: [conversation] });
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => b.sortKey - a.sortKey)
    .map((group) => ({
      ...group,
      conversations: group.conversations.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    }));
}

function formatRelativeTimeAgo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) {
    return t.chat.relativeJustNow;
  }
  if (minutes < 60) {
    return t.chat.relativeMinutesAgo.replace("{n}", String(minutes));
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t.chat.relativeHoursAgo.replace("{n}", String(hours));
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return t.chat.relativeDaysAgo.replace("{n}", String(days));
  }

  return date.toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
  });
}

function getConversationSnippet(conversation: ChatConversation): string {
  const lastMessage = [...conversation.messages].reverse().find((message) => message.content.trim());
  const raw = (lastMessage?.content || conversation.title || t.chat.emptySnippet).replace(/\s+/g, " ").trim();

  if (raw.length <= 88) {
    return raw;
  }
  return `${raw.slice(0, 88)}...`;
}

function getDisplayInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }
  return trimmed.slice(0, 1).toUpperCase();
}

function isItineraryConversation(conversation: ChatConversation): boolean {
  return conversation.id === CHAT_REMOTE_CONVERSATION_ID || Boolean(conversation.tripId);
}

type Props = {
  expanded: boolean;
  conversations: ChatConversation[];
  activeConversationId: string | null;
  userName?: string | null;
  userImage?: string | null;
  onExpand: () => void;
  onCollapse: () => void;
  onNewConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
};

export default function ChatHistorySidebar({
  expanded,
  conversations,
  activeConversationId,
  userName,
  userImage,
  onExpand,
  onCollapse,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
}: Props) {
  const displayName = userName?.trim() || t.sidebar.guest;
  const groupedConversations = groupConversationsByDate(conversations);

  return (
    <aside
      className={cn(
        "relative z-10 hidden min-h-0 shrink-0 flex-col border-r border-slate-300 bg-white shadow-[1px_0_0_rgba(15,23,42,0.06)] transition-[width,padding] duration-200 ease-out md:flex",
        expanded ? "w-[300px] px-4 py-4" : "w-[52px] items-center border-slate-300 px-2 py-4",
      )}
    >
      {!expanded ? (
        <CollapsedRail onExpand={onExpand} onNewConversation={onNewConversation} />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onCollapse}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-chat-muted transition-colors hover:bg-[var(--chat-hover)] hover:text-chat-fg"
              aria-expanded={true}
              aria-controls="chat-history-sidebar-panel"
              title={t.chat.collapseHistorySidebar}
              aria-label={t.chat.collapseHistorySidebar}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <p
              id="chat-history-sidebar-panel"
              className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-[0.14em] text-chat-subtle"
            >
              {t.chat.sidebarTitle}
            </p>
          </div>

          <button
            type="button"
            onClick={onNewConversation}
            className="mb-4 flex w-full items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-white"
            aria-label={t.chat.startNewChatAria}
          >
            <span className="text-sm font-semibold text-slate-900">{t.chat.startNewChat}</span>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-200 text-slate-700">
              <MessageSquarePlus className="size-4" aria-hidden />
            </span>
          </button>

          <div role="separator" className="mb-4 border-t border-dashed border-chat-dashed" aria-hidden />

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
            {conversations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/20 px-4 py-6 text-center text-xs leading-relaxed text-chat-muted chat-glass-card">
                {t.chat.emptyConversationsHint}
              </div>
            ) : (
              groupedConversations.map((group) => (
                <section key={group.label} className="space-y-2">
                  <h3 className="mx-auto w-fit rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-chat-muted chat-glass-date-pill">
                    {group.label}
                  </h3>
                  <div className="space-y-2.5">
                    {group.conversations.map((conversation) => {
                      const isActive = conversation.id === activeConversationId;
                      const itineraryTag = isItineraryConversation(conversation);

                      return (
                        <div
                          key={conversation.id}
                          className={cn(
                            "group relative overflow-hidden rounded-[18px] border border-slate-200 bg-white transition-colors",
                            isActive
                              ? "border-slate-900 bg-slate-50"
                              : "hover:bg-slate-50",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectConversation(conversation.id)}
                            className="w-full px-3.5 pb-3 pt-3 pr-10 text-left"
                          >
                            <div className="flex items-center gap-2.5">
                              {userImage ? (
                                // eslint-disable-next-line @next/next/no-img-element -- OAuth 頭像為外部 URL
                                <img
                                  src={userImage}
                                  alt=""
                                  width={32}
                                  height={32}
                                  className="size-8 shrink-0 rounded-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-900">
                                  {getDisplayInitials(displayName)}
                                </span>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="truncate text-sm font-semibold text-slate-900">
                                    {conversation.title}
                                  </span>
                                  <span
                                    className={cn(
                                      "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                                      itineraryTag
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-slate-100 text-slate-600",
                                    )}
                                  >
                                    {itineraryTag ? t.chat.tagItinerary : t.chat.tagAi}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">
                              {getConversationSnippet(conversation)}
                            </p>
                            <p className="mt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
                              {formatRelativeTimeAgo(conversation.updatedAt)}
                            </p>
                          </button>
                          <button
                            type="button"
                            className="absolute right-2 top-3 z-[1] flex size-7 items-center justify-center rounded-lg text-red-600 opacity-0 transition-opacity hover:bg-red-500/10 group-hover:opacity-100"
                            aria-label={t.chat.deleteConversationAria}
                            onClick={(event) => {
                              event.stopPropagation();
                              void onDeleteConversation(conversation.id);
                            }}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function CollapsedRail({
  onExpand,
  onNewConversation,
}: {
  onExpand: () => void;
  onNewConversation: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-3">
      <button
        type="button"
        onClick={onExpand}
        className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-100"
        aria-expanded={false}
        title={t.chat.expandHistorySidebar}
        aria-label={t.chat.expandHistorySidebar}
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onNewConversation}
        className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary shadow-sm transition-colors hover:border-primary/45 hover:bg-primary/15"
        title={t.chat.newConversationAria}
        aria-label={t.chat.newConversationAria}
      >
        <Plus className="size-4" aria-hidden />
      </button>
      <div className="flex flex-1 flex-col items-center pt-1">
        <History className="size-4 text-slate-500" aria-hidden />
      </div>
    </div>
  );
}
