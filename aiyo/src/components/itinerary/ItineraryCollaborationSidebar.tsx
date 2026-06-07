"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { m } from "@/lib/motion";
import { MessageSquare, Plus, Trash2, Users } from "lucide-react";
import { zhTW as t } from "@/locales/zh-TW";
import { cn } from "@/lib/utils";
import { syncService } from "@/services/syncService";
import { useCollabStore } from "@/stores/useCollabStore";
import { useToastStore } from "@/stores/useToastStore";

const avatarColors = [
  "bg-secondary",
  "bg-primary",
  "bg-lavender",
  "bg-tertiary",
  "bg-peach",
];

function memberDisplayAvatar(
  member: { id: string; name: string; avatar: string },
  sessionUserId: string | undefined,
  sessionImage: string | null | undefined,
): string | null {
  if (member.id === sessionUserId && sessionImage) {
    return sessionImage;
  }
  return member.avatar.trim() || null;
}

function memberInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : "?";
}

type Props = {
  /** 與行程頁深色資料夾區一致 */
  variant?: "light" | "dark";
};

export default function ItineraryCollaborationSidebar({ variant = "light" }: Props) {
  const { data: session } = useSession();
  const { members, comments, roomId, setCollaboration } = useCollabStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const myUserId = session?.user?.id;
  const isDark = variant === "dark";
  const panelClass = isDark
    ? "rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 shadow-none"
    : "rounded-2xl border border-border-light bg-surface p-4 shadow-soft";
  const mutedClass = isDark ? "text-zinc-500" : "text-muted";
  const inputClass = isDark
    ? "flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary/30"
    : "flex-1 rounded-xl border border-border bg-cream/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30";

  function canDeleteComment(authorId: string | undefined) {
    if (!myUserId || !authorId) {
      return false;
    }
    if (authorId === myUserId) {
      return true;
    }
    const me = members.find((m) => m.id === myUserId);
    return me?.role === "owner";
  }

  async function handleDeleteComment(commentId: string) {
    if (!roomId) {
      return;
    }
    setDeletingId(commentId);
    try {
      const state = await syncService.deleteComment(roomId, commentId);
      setCollaboration(state);
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.collab.commentDeleteFailed,
        description: error instanceof Error ? error.message : t.collab.commentDeleteFailedDesc,
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAddComment() {
    if (!newComment.trim() || !roomId) {
      return;
    }
    setIsSubmittingComment(true);
    try {
      const state = await syncService.addComment(roomId, newComment.trim());
      setCollaboration(state);
      setNewComment("");
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.collab.commentSyncFailed,
        description: error instanceof Error ? error.message : t.collab.commentSyncFailedDesc,
      });
    } finally {
      setIsSubmittingComment(false);
    }
  }

  if (!roomId) {
    return (
      <div
        className={cn(
          "rounded-2xl border p-4 text-xs",
          isDark ? "border-zinc-800 bg-zinc-900/80 text-zinc-500" : "border-border-light bg-surface/80 text-muted",
        )}
      >
        {t.collab.roomNotReadyHint}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={panelClass}>
        <h3
          className={cn(
            "mb-3 flex items-center gap-2 text-sm font-semibold",
            isDark ? "text-zinc-100" : "text-foreground",
          )}
        >
          <Users className="size-4 text-primary" />
          {t.collab.teamMembers}
        </h3>
        <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
          {members.map((member, index) => {
            const avatarUrl = memberDisplayAvatar(member, myUserId, session?.user?.image);
            return (
            <div
              key={member.id}
              className={cn(
                "flex items-center gap-2 rounded-xl px-2 py-2",
                isDark ? "bg-zinc-800/80" : "bg-cream/40",
              )}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- member avatar URL
                <img
                  src={avatarUrl}
                  alt=""
                  className="size-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                    avatarColors[index % avatarColors.length],
                  )}
                >
                  {memberInitial(member.name)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-xs font-medium", isDark ? "text-zinc-100" : "text-foreground")}>
                  {member.name}
                </p>
                <p className={cn("text-[10px]", mutedClass)}>{member.online ? t.collab.online : t.collab.offline}</p>
              </div>
            </div>
            );
          })}
          {members.length === 0 && (
            <p className={cn("py-2 text-center text-xs", mutedClass)}>{t.collab.noMembersHint}</p>
          )}
        </div>
      </div>

      <div className={panelClass}>
        <h3
          className={cn(
            "mb-3 flex items-center gap-2 text-sm font-semibold",
            isDark ? "text-zinc-100" : "text-foreground",
          )}
        >
          <MessageSquare className="size-4 text-secondary" />
          {t.collab.stickyComments}
        </h3>
        <div className="mb-3 flex items-center gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(event) => setNewComment(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void handleAddComment()}
            placeholder={t.collab.commentPlaceholder}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void handleAddComment()}
            disabled={isSubmittingComment || !roomId}
            className="rounded-xl bg-primary p-2 text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
          {comments.map((comment) => (
            <m.div
              key={comment.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "rounded-xl border p-3 text-xs",
                isDark ? "border-zinc-800 bg-zinc-950/60" : "border-border-light",
              )}
              style={isDark ? undefined : { backgroundColor: `${comment.color}18` }}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className={cn("font-medium", isDark ? "text-zinc-100" : "text-foreground")}>{comment.author}</span>
                <span className={cn("ml-auto text-[10px]", mutedClass)}>
                  {new Date(comment.createdAt).toLocaleString("zh-TW")}
                </span>
                {canDeleteComment(comment.authorId) && (
                  <button
                    type="button"
                    aria-label={t.collab.deleteCommentAria}
                    title={t.collab.deleteCommentAria}
                    disabled={deletingId === comment.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteComment(comment.id);
                    }}
                    className={cn(
                      "shrink-0 rounded-lg p-1 opacity-80 transition-colors hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40",
                      isDark
                        ? "text-zinc-500 hover:bg-zinc-800 hover:text-orange-400"
                        : "text-muted hover:bg-danger/10 hover:text-danger",
                    )}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              <p className={cn("leading-relaxed", isDark ? "text-zinc-300" : "text-foreground")}>{comment.content}</p>
            </m.div>
          ))}
          {comments.length === 0 && (
            <p
              className={cn(
                "rounded-xl border border-dashed py-4 text-center text-xs",
                isDark ? "border-zinc-800 text-zinc-500" : "border-border-light text-muted",
              )}
            >
              {t.collab.noCommentsLong}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
